/**
 * @module ol/metoclient/MetOClient
 */
import { assign } from 'ol/obj';
import { register } from 'ol/proj/proj4.js';
import proj4 from 'proj4/dist/proj4.js'; // Todo: do not use built version
import { transform } from 'ol/proj';
import { parseTimes, updateSourceTime } from './util.js';
import { interval, timeout } from 'd3-timer';
import BaseObject from 'ol/Object';
import TimeSlider from './TimeSlider';
import LayerCreator from './LayerCreator';
import SourceUpdater from './SourceUpdater';
import CapabilitiesReader from './CapabilitiesReader';
import { unByKey } from 'ol/Observable';
import * as constants from './constants';
import { DateTime, Duration } from 'luxon';
import ajax from 'can-ajax';
import Map from 'ol/Map';
import View from 'ol/View';
import Collection from 'ol/Collection';
import Url from 'domurl';
import LayerSwitcher from 'ol-layerswitcher';
import Zoom from 'ol/control/Zoom';
import DoubleClickZoom from 'ol/interaction/DoubleClickZoom';
import DragPan from 'ol/interaction/DragPan';
import PinchZoom from 'ol/interaction/PinchZoom';
import KeyboardPan from 'ol/interaction/KeyboardPan';
import KeyboardZoom from 'ol/interaction/KeyboardZoom';
import Style from 'ol/style/Style';
import ElementVisibilityWatcher from 'element-visibility-watcher';
import olms from 'ol-mapbox-style';

/**
 * @classdesc
 * @api
 */
export class MetOClient extends BaseObject {

  /**
   * @param {Object} options Map options.
   */
  constructor (options = {}) {
    super();
    proj4.defs('EPSG:3067', '+proj=utm +zone=35 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
    register(proj4);
    this.config_ = assign(constants.DEFAULT_OPTIONS, options);
    if ((options.target == null) && (options.container != null)) {
      this.config_.target = options.container;
    }
    this.set('options', options, true);
    this.set('map', null);
    this.vectorConfig_ = null;
    this.timeSlider_ = null;
    this.status_ = {};
    this.delay_ = ((options.refreshInterval != null) && (options.refreshInterval <= Number.MAX_SAFE_INTEGER) && (options.refreshInterval >= 0)) ? options.refreshInterval : constants.DEFAULT_DELAY;
    this.periodDelay_ = 2 * constants.DEFAULT_DELAY;
    this.times_ = [];
    this.playingListener_ = null;
    this.nextListener_ = null;
    this.previousListener_ = null;
    this.renderComplete_ = false;
    this.updateNeeded_ = false;
    this.waitingRender_ = 0;
    this.refreshInterval_ = options.refreshInterval ? Math.min(Duration.fromISO(options.refreshInterval).valueOf(), constants.MAX_REFRESH_INTERVAL) : constants.DEFAULT_REFRESH_INTERVAL;
    this.capabilities_ = {};
    this.legends_ = {};
    this.selectedLegend_ = constants.DEFAULT_LEGEND;
    this.layerSwitcherWatcher = null;
    this.on('change:options', () => {
      this.config_ = assign(constants.DEFAULT_OPTIONS, this.get('options'));
      this.refresh();
    });
  }

  getVectorConfig_ () {
    return this.vectorConfig_ = this.config_.layers.reduce((vectorConfig, layer) => {
      const source = this.config_.sources[layer.source];
      if ((source != null) && (layer.url == null) && (['geojson', 'vector', 'raster'].includes(source.type))) {
        vectorConfig.layers.push(layer);
        if (vectorConfig.sources[layer.source] == null) {
          vectorConfig.sources[layer.source] = source;
        }
      }
      return vectorConfig;
    }, {
      version: 8,
      sources: {},
      layers: []
    });
  }

  /**
   *
   * @returns {Promise<void>}
   */
  render () {
    return this.updateCapabilities_().then(() => {
      this.updateTimes_();
      let defaultTime = this.times_[0];
      const realWorldTime = Date.now();
      this.times_.some(time => {
        const future = (time > realWorldTime);
        if (!future) {
          defaultTime = time;
        }
        return future;
      });
      if (this.config_.time == null) {
        this.config_.time = defaultTime;
      }
      // Limit bounds after refresh
      if (this.config_.time < this.times_[0]) {
        this.config_.time = this.times_[0];
      }
      let lastTimeIndex = this.times_.length - 1;
      if (this.config_.time > this.times_[lastTimeIndex]) {
        this.config_.time = this.times_[lastTimeIndex];
      }
      Object.keys(this.config_.sources).forEach(source => {
        if ((this.config_.sources[source].times != null) && (this.config_.sources[source].times.length > 0)) {
          this.config_.sources[source].tiles = updateSourceTime(this.config_.sources[source].tiles, this.config_.sources[source].times.includes(defaultTime) ? defaultTime : this.config_.sources[source].times[0]);
        }
      });
      this.vectorConfig_ = this.getVectorConfig_();
      return this.updateMap_();
    }).catch(error => {
      console.log(error);
    });
  }

  /**
   *
   */
  refresh_ () {
    const map = this.get('map');
    if (map != null) {
      let layers = map.getLayers().getArray();
      layers.forEach((layer) => {
        let source = layer.getSource();
        let time = source.get(constants.SOURCE_TIME);
        if (time != null) {
          source.set(constants.SOURCE_TIME, null);
        }
      });
    }
    this.render();
  }

  /**
   *
   * @returns {Promise<void>}
   * @private
   */
  async updateCapabilities_ () {
    let updateTime = Date.now();
    let responses = await Promise.all(this.config_.layers.reduce((urls, layer) => {
      if (layer.source == null) {
        return urls;
      }
      let sourceIds = [layer.source];
      if ((layer.time != null) && (layer.time.source != null) && (!sourceIds.includes(layer.time.source))) {
        sourceIds.push(layer.time.source);
      }
      sourceIds.forEach(sourceId => {
        let source = this.config_.sources[sourceId];
        if (source == null) {
          return;
        }
        let url = '';
        if ((source.capabilities != null) && (source.capabilities.length > 0)) {
          url = source.capabilities;
        } else {
          if ((source.tiles == null) || (source.tiles.length === 0)) {
            return;
          }
          url = source.tiles[0]; // Todo: Handle other indexes
        }
        if (url.endsWith('/')) {
          url = url.substring(0, url.length - 1);
        }
        const index = url.lastIndexOf('/');
        let type = '';
        if ((url.toLowerCase().startsWith('http')) && (index >= 0)) {
          type = url.substring(index + 1).toLowerCase();
        } else {
          type = layer.url.service.toLowerCase();
        }
        if (this.capabilities_[url] == null) {
          this.capabilities_[url] = {
            updated: null,
            type: type,
            data: null
          };
        }
        if (this.capabilities_[url].updated !== updateTime) {
          urls.push(url + `?service=${type}&${constants.GET_CAPABILITIES_QUERY}`);
          this.capabilities_[url].updated = updateTime;
        }
      });
      return urls;
    }, []).map(url => ajax({
      url: url,
      crossDomain: true,
      contentType: 'text/plain',
      beforeSend: function(jqxhr) {
        jqxhr.requestURL = url;
      }
    })));
    await Promise.all(responses.map(response => {
      if ((response.responseText != null) && (response.requestURL.endsWith(constants.GET_CAPABILITIES_QUERY))) {
        let capabKey = response.requestURL.split('?')[0];
        const capabKeyParts = capabKey.split('/');
        let localCapabKey = '';
        if (capabKeyParts.length > 0) {
          localCapabKey = capabKeyParts[capabKeyParts.length - 1];
        }
        if ((localCapabKey.length > 0) && (this.capabilities_[localCapabKey] != null)) {
          capabKey = localCapabKey;
        }
        if (typeof CapabilitiesReader[this.capabilities_[capabKey].type] === 'function') {
          this.capabilities_[capabKey].data = CapabilitiesReader[this.capabilities_[capabKey].type](response.responseText);
        }
      }
    }));
  }

  /**
   *
   * @param layer
   * @returns {boolean}
   * @private
   */
  isTiledLayer_ (layer) {
    if ((layer == null) || (layer.source == null)) {
      return false;
    }
    if ((layer.url != null) && (typeof layer.url.service === 'string') && (layer.url.service.toLowerCase() === 'wmts')) {
      return true;
    }
    const source = this.config_.sources[layer.source];
    if (source.type === 'OSM') {
      return true;
    }
    if ((source == null) || (source.tiles == null)) {
      return false;
    }
    let tiled = Array.isArray(source.tileSize) ? source.tileSize.map(tileSize => Number(tileSize) > 0) : new Array(2).fill(Number(source.tileSize) > 0);
    if (Array.isArray(source.tiles)) {
      // Todo: Handle also other indexes
      const url = new Url(source.tiles[0].toLowerCase());
      tiled = ['width', 'height'].map((measure, index) => ((url.query != null) && (url.query[measure] !== undefined) && (Number(url.query[measure]) > 0)) || tiled[index]);
    }
    if (layer.url != null) {
      ['width', 'height'].forEach((measure, index) => {
        if (layer.url[measure] !== undefined) {
          tiled[index] = (Number(layer.url[measure]) > 0);
        }
      });
    }
    return tiled.every(Boolean);
  }

  isAnimationLayer_ (layer) {
    return (layer.get('times') != null) && (!layer.get('id').startsWith('metoclient:'));
  }

  getLayerType_(layer) {
    if (this.isTiledLayer_(layer)) {
      return 'tiled';
    }
    if ((layer.type != null) && (layer.type !== 'raster')) {
      return layer.type;
    }
    return 'image';
  }

  createLayer_ (layerConfig, time = this.config_.time, postfix = '') {
    const layerType = this.getLayerType_(layerConfig);
    if (LayerCreator[layerType] == null) {
      return null;
    }
    const source = this.config_.sources[layerConfig.source];
    const timeDefined = (layerConfig.time != null) && (layerConfig.time.data != null);
    const postfixDefined = (postfix.length > 0);
    if (postfixDefined && !timeDefined) {
      return null;
    }
    let options = { ...this.config_ };
    if (timeDefined) {
      options.time = time;
      if (!layerConfig.time.data.includes(options.time)) {
        options.time = layerConfig.time.data.reduce((prevTime, time) => {
          if ((time < this.config_.time) && (time > prevTime)) {
            prevTime = time;
          }
          return prevTime;
        }, layerConfig.time.data[0]);
      }
    }
    const tiles = source.tiles != null ? source.tiles[0] : null;
    const url = ((source.capabilities != null) && (source.capabilities.length > 0)) ? source.capabilities : tiles;
    const layer = LayerCreator[layerType](layerConfig, options, url != null ? this.capabilities_[url] : null);
    if (layer != null) {
      layer.on('change:visible', event => {
        const visible = layer.getVisible();
        ['previous', 'next'].forEach(relative => {
          this.setRelativesVisible_(layer, relative, visible);
          const previousLayer = layer.get('metoclient:previous');
          if (previousLayer != null) {
            previousLayer.setVisible(visible);
          }
          const nextLayer = layer.get('metoclient:next');
          if (nextLayer != null) {
            nextLayer.setVisible(visible);
          }
        });
        if (this.isAnimationLayer_(layer)) {
          if (!this.isVisibleTime_(this.config_.time)) {
            const nextTime = this.getNextTime_();
            const prevTime = this.getPrevTime_();
            const newTime = (Math.abs(nextTime - this.config_.time) < Math.abs(this.config_.time - prevTime)) ? nextTime : prevTime;
            if (newTime != null) {
              this.get('map').set('time', newTime);
            }
          }
          this.updateTimeSlider_();
        }
      });
      if (timeDefined) {
        layer.set('times', layerConfig.time.data);
      }
      layer.set('metoclient:opacity', layerConfig.opacity != null ? layerConfig.opacity : 1);
      const id = layer.get('id');
      layer.set('metoclient:id', id);
      if (postfixDefined) {
        layer.set('id', 'metoclient:' + id + postfix);
        layer.set('title', '');
        this.hideLayer_(layer);
      } else {
        const prevLayerId = layer.get('previous');
        const prevLayer = ((prevLayerId != null) && (prevLayerId.length > 0)) ? this.config_.layers.find(configLayer => configLayer.id === prevLayerId) : null;
        const prevTimes = ((prevLayer != null) && (prevLayer.time != null)) ? prevLayer.time.data : [];
        if (prevTimes.includes(this.config_.time)) {
          this.hideLayer_(layer);
        }
      }
    }
    return layer;
  }

  createLayerSwitcherTitle_ (layerConfig) {
    let title = layerConfig.metadata.title;
    let layersConfig = this.config_.layers;
    const nextLayerId = layerConfig.next;
    const nextLayerConfig = ((nextLayerId != null) && (nextLayerId.length > 0)) ? layersConfig.find(layer => layer.id === nextLayerId) : null;
    let nextTitle = (nextLayerConfig != null) ? this.createLayerSwitcherTitle_(nextLayerConfig) : '';
    if ((nextTitle != null) && (nextTitle.length > 0) && (title !== nextTitle)) {
      title += ' / ' + nextTitle;
    }
    layerConfig.metadata.title = '';
    return title;
  }

  /**
 *
 *
 * @param {*} layer
 * @param {*} relative
 * @param {*} visible
 * @memberof MetOClient
 */
  setRelativesVisible_ (layer, relative, visible) {
    let relativeLayerId = layer.get(relative);
    let layers = this.get('map').getLayers().getArray();
    const relativeLayer = ((relativeLayerId != null) && (relativeLayerId.length > 0)) ? layers.find(layer => layer.get('id') === relativeLayerId) : null;
    if (relativeLayer != null) {
      relativeLayer.setVisible(visible);
      this.setRelativesVisible_(relativeLayer, relative, visible);
      let previousLayer = relativeLayer.get('metoclient:previous');
      if (previousLayer != null) {
        previousLayer.setVisible(visible);
      }
      let nextLayer = relativeLayer.get('metoclient:next');
      if (nextLayer != null) {
        nextLayer.setVisible(visible);
      }
    }
  }

  /**
   *
   * @returns {Collection}
   * @private
   */
  createLayers_ () {
    const numBaseMaps = this.config_.layers.reduce((baseMapCount, layerConfig) => baseMapCount + ((layerConfig.metadata != null) && (layerConfig.metadata.type != null) && (layerConfig.metadata.type.toLowerCase() === 'base')), 0);
    let layers = new Collection(this.config_.layers.map(layerConfig => {
      if ((layerConfig.time != null) && (layerConfig.metadata != null) && (layerConfig.metadata.title != null)) {
        layerConfig.legendTitle = layerConfig.metadata.title;
      }
      return layerConfig;
    }).reduce((olLayers, layerConfig) => {
      if ((layerConfig.time != null) && ((layerConfig.previous == null) || (layerConfig.previous.length === 0)) && (layerConfig.metadata != null) && (layerConfig.metadata.title != null)) {
        layerConfig.metadata.title = this.createLayerSwitcherTitle_(layerConfig);
      }
      if (layerConfig.url != null) {
        layerConfig.url = Object.keys(layerConfig.url).reduce((lowerCased, key) => {
          lowerCased[key.toLowerCase()] = layerConfig.url[key];
          return lowerCased;
        }, {});
      }
      if ((layerConfig.source == null) || ((layerConfig.url != null) && ((typeof layerConfig.url.service !== 'string') || (layerConfig.url.service.length === 0)))) {
        return olLayers;
      }
      if ((numBaseMaps === 1) && (layerConfig.metadata != null) && (layerConfig.metadata.type != null) && (layerConfig.metadata.type.toLowerCase() === 'base')) {
        layerConfig.metadata.title = '';
      }
      const olLayer = this.createLayer_(layerConfig);
      if (olLayer != null) {
        olLayers.push(olLayer);
      }
      return olLayers;
    }, []));
    layers.getArray().forEach((layer, index, layersArray) => {
      const opacity = layer.get('metoclient:opacity');
      if (layer.get('times') == null) {
        layers.item(index).setOpacity(opacity);
      } else {
        let source = layer.getSource();
        let time = source.get('metoclient:time');
        if (time === this.config_.time) {
          const previousId = layer.get('previous');
          if ((previousId != null) && (previousId.length > 0)) {
            let previous = layersArray.find(l => l.get('id') === previousId);
            const previousTimes = previous.get('times');
            if (!previousTimes.includes(this.config_.time)) {
              layers.item(index).setOpacity(opacity);
            }
          }
        }
      }
    });
    return layers;
  }

  setVisible_ (layer, visible) {
    visible ? this.showLayer_(layer) : this.hideLayer_(layer);
  }

  showLayer_ (layer) {
    let opacity = layer.get('metoclient:opacity');
    if (opacity == null) {
      opacity = 1;
    }
    layer.setOpacity(opacity);
  }

  hideLayer_ (layer) {
    layer.setOpacity(0);
  }

  /**
   *
   * @returns {View}
   * @private
   */
  createView_ () {
    let viewOptions = {...this.config_};
    delete viewOptions.sources;
    delete viewOptions.layers;
    return new View(viewOptions);
  }

  /**
   *
   * @param time
   * @returns {boolean}
   * @private
   */
  isVisibleTime_ (time) {
    return this.get('map').getLayers().getArray().some(layer => ((layer.getVisible()) && (layer.get('times') != null) && (layer.get('times').includes(time))));
  }

  /**
   *
   * @private
   */
  updateTimeSlider_ () {
    this.timeSlider_.updateTimeLoaderVis(this.times_.map(time => ({
      endTime: time,
      status: this.status_[time],
      active: this.isVisibleTime_(time)
    })));
  }

  currentTimeRendered_ (event) {
    let map = this.get('map');
    if (map == null) {
      return;
    }
    let layers = map.getLayers().getArray().filter(layer => layer.get('mapbox-source') == null);
    layers.forEach(layer => {
      const times = layer.get('times');
      let visible = ((times == null) || (!Array.isArray(times)) || (times.length === 0));
      if (!visible) {
        let source = layer.getSource();
        const visibleTime = this.getVisibleTime_(layer);
        if (source.get('metoclient:time') === visibleTime) {
          visible = true;
          const prevLayerId = layer.get('previous');
          const prevLayer = ((prevLayerId != null) && (prevLayerId.length > 0)) ? layers.find(l => l.get('id') === prevLayerId) : null;
          if (prevLayer != null) {
            const prevTimes = prevLayer.get('times');
            if (prevTimes[prevTimes.length - 1] >= this.config_.time) {
              visible = false;
            }
          }
        }
      }
      this.setVisible_(layer, visible);
    });
    this.status_[this.config_.time] = constants.STATUS_SUCCESS;
    this.updateTimeSlider_();
    if (this.updateNeeded_) {
      this.updateNeeded_ = false;
      this.renderComplete_ = true;
      this.timeUpdated_();
    } else if (this.config_.time != null) {
      const prevTime = this.getPrevTime_();
      const nextTime = this.getNextTime_();
      layers.filter(layer => {
        const times = layer.get('times');
        if ((times == null) || (!Array.isArray(times)) || (times.length === 0)) {
          return false;
        }
        return (!layer.get('id').startsWith('metoclient:'));
      }).forEach(layer => {
        let layerId = layer.get('id');
        let layerConfig = this.config_.layers.find(layerConfig => layerConfig.id === layerId);
        let skipPrevious = false;
        let skipNext = false;
        const times = layer.get('times');
        let layerPrevTime;
        let layerNextTime;
        const previous = layer.get('previous');
        const next = layer.get('next');
        if ((map.get('playing')) || ((prevTime < times[0]) && (previous != null) && (previous.length > 0))) {
          skipPrevious = true;
        } else {
          layerPrevTime = times.includes(prevTime) ? prevTime : times.reduce((closestPrevTime, time) => (((time < prevTime) && (prevTime - time < closestPrevTime)) ? time : closestPrevTime), Number.POSITIVE_INFINITY);
          if (layerPrevTime > prevTime) {
            layerPrevTime = Math.max(...times);
          }
        }
        if ((nextTime > times[times.length - 1]) && (next != null) && (next.length > 0)) {
          skipNext = true;
        } else {
          layerNextTime = times.includes(nextTime) ? nextTime : times.reduce((closestNextTime, time) => (((time > nextTime) && (nextTime - time > closestNextTime)) ? time : closestNextTime), Number.NEGATIVE_INFINITY);
          if (layerNextTime < nextTime) {
            layerNextTime = Math.min(...times);
          }
        }
        let layers = map.getLayers();
        let prevLayer = layer.get('metoclient:previous');
        if ((prevLayer == null) && (layerConfig != null) && (layerPrevTime != null)) {
          prevLayer = this.createLayer_(layerConfig, layerPrevTime, '-previous');
          prevLayer.setVisible(layer.getVisible());
          let index = layers.getArray().findIndex(l => l.get('metoclient:id') === layer.get('metoclient:id'));
          layers.insertAt(index, prevLayer);
          layer.set('metoclient:previous', prevLayer);
        }
        if ((!skipPrevious) && (prevLayer != null)) {
          const prevSource = prevLayer.getSource();
          if (prevSource.get('metoclient:time') !== layerPrevTime) {
            this.hideLayer_(prevLayer);
            SourceUpdater[prevSource.constructor.name](prevSource, layerPrevTime);
          }
        }
        let nextLayer = layer.get('metoclient:next');
        if ((nextLayer == null) && (layerConfig != null) && (layerNextTime != null)) {
          nextLayer = this.createLayer_(layerConfig, layerNextTime, '-next');
          nextLayer.setVisible(layer.getVisible());
          let index = layers.getArray().findIndex(l => l.get('metoclient:id') === layer.get('metoclient:id'));
          layers.insertAt(index, nextLayer);
          layer.set('metoclient:next', nextLayer);
        }
        if ((!skipNext) && (nextLayer != null)) {
          const nextSource = nextLayer.getSource();
          if (nextSource.get('metoclient:time') !== layerNextTime) {
            this.hideLayer_(nextLayer);
            SourceUpdater[nextSource.constructor.name](nextSource, layerNextTime);
          }
        }
      });
      map.renderSync();
      map.once('rendercomplete', event => {
        this.renderComplete_ = true;
        if (this.updateNeeded_) {
          this.updateNeeded_ = false;
          this.timeUpdated_();
        } else if (this.waitingRender_ > 0) {
          timeout(this.animate_.bind(this), Math.max(this.delay_ - (Date.now() - this.waitingRender_), 0));
        }
      });
    }
  }

  getLayerSwitcher_ () {
    const map = this.get('map');
    if (map == null) {
      return null;
    }
    const controls = map.getControls();
    if (controls == null) {
      return null;
    }
    return controls.getArray().find(control => (control.constructor != null) && (control.constructor.name === 'LayerSwitcher'));
  }

  /**
   *
   * @param layer
   * @returns {any}
   * @private
   */
  getVisibleTime_ (layer) {
    let visibleTime = null;
    const layerTimes = layer.get('times');
    if ((layerTimes != null) && (Array.isArray(layerTimes)) && (layerTimes.length > 0) && (this.config_.time >= layerTimes[0])) {
      layerTimes.some(time => {
        const notHistory = (time >= this.config_.time);
        if (notHistory) {
          visibleTime = time;
        }
        return notHistory;
      });
    }
    return visibleTime;
  }

  /**
   *
   * @private
   */
  timeUpdated_ () {
    let mapTime = this.get('map').get('time');
    const layers = this.get('map').getLayers().getArray();
    layers.filter((layer) => layer.get('mapbox-source') != null).forEach((featureLayer) => {
      const layerTimes = featureLayer.get('times');
      const hideAll = (mapTime < layerTimes[0]) || (mapTime > layerTimes[layerTimes.length - 1]);
      const layerTime = hideAll ? null : [...layerTimes].reverse().find((time) => time <= mapTime);
      featureLayer.getSource().getFeatures().forEach((feature) => {
        if ((hideAll) || (feature.get('metoclient:time') !== layerTime)) {
          feature.setStyle(new Style({}));
        } else {
          feature.setStyle(null);
        }
      });
    });
    if (!this.renderComplete_) {
      if (this.status_[mapTime] !== constants.STATUS_SUCCESS) {
        this.status_[mapTime] = constants.STATUS_WORKING;
        this.updateTimeSlider_();
      }
      this.updateNeeded_ = true;
      return;
    }
    this.get('map').once('rendercomplete', this.currentTimeRendered_.bind(this));
    this.status_[this.config_.time] = constants.STATUS_SUCCESS;
    this.config_.time = this.get('map').get('time');
    this.status_[this.config_.time] = constants.STATUS_WORKING;
    Object.keys(this.status_).forEach(time => {
      if ((Number(time) !== this.config_.time) && (this.status_[time] === constants.STATUS_WORKING)) {
        this.status_[time] = '';
      }
    });
    this.updateTimeSlider_();
    layers.filter(layer => layer.get('mapbox-source') == null).filter(layer => {
      const times = layer.get('times');
      if ((times == null) || (!Array.isArray(times)) || (times.length === 0)) {
        return false;
      }
      if ((this.config_.time < times[0]) || (this.config_.time > times[times.length - 1])) {
        this.hideLayer_(layer);
        return false;
      }
      const prevLayerId = layer.get('previous');
      const prevLayer = ((prevLayerId != null) && (prevLayerId.length > 0)) ? layers.find(layer => layer.get('id') === prevLayerId) : null;
      const prevTimes = (prevLayer != null) ? prevLayer.get('times') : [];
      if (prevTimes.includes(this.config_.time)) {
        this.hideLayer_(layer);
        return false;
      }
      return (!layer.get('id').startsWith('metoclient:'));
    }).forEach(layer => {
      const source = layer.getSource();
      let visibleTime = this.getVisibleTime_(layer);
      if (source.get('metoclient:time') === visibleTime) {
        let prevLayer = layer.get('metoclient:previous');
        if (prevLayer != null) {
          this.hideLayer_(prevLayer);
        } else {
          this.status_[this.config_.time] = constants.STATUS_SUCCESS;
          this.updateTimeSlider_();
        }
        let nextLayer = layer.get('metoclient:next');
        if (nextLayer != null) {
          this.hideLayer_(nextLayer);
        }
        this.showLayer_(layer);
      } else {
        let prevLayer = layer.get('metoclient:previous');
        let nextLayer = layer.get('metoclient:next');
        if (prevLayer != null) {
          let prevSource = prevLayer.getSource();
          if ((prevSource != null) && (prevSource.get('metoclient:time') === visibleTime)) {
            this.hideLayer_(layer);
            this.showLayer_(prevLayer);
            const baseId = layer.get('metoclient:id');
            layer.set('id', 'metoclient:' + baseId + '-next');
            prevLayer.set('id', baseId);
            if (nextLayer != null) {
              nextLayer.set('id', 'metoclient:' + baseId + '-previous');
            }
            prevLayer.set('metoclient:previous', nextLayer);
            prevLayer.set('metoclient:next', layer);
            prevLayer.set('title', layer.get('title'));
            layer.set('metoclient:next', prevLayer);
            layer.set('title', '');
            return;
          }
        }
        if (nextLayer != null) {
          let nextSource = nextLayer.getSource();
          if (nextSource != null) {
            if (nextSource.get('metoclient:time') === visibleTime) {
              this.hideLayer_(layer);
              this.showLayer_(nextLayer);
              const baseId = layer.get('metoclient:id');
              layer.set('id', 'metoclient:' + baseId + '-previous');
              nextLayer.set('id', baseId);
              if (prevLayer != null) {
                prevLayer.set('id', 'metoclient:' + baseId + '-next');
              }
              nextLayer.set('metoclient:previous', layer);
              nextLayer.set('metoclient:next', prevLayer);
              nextLayer.set('title', layer.get('title'));
              layer.set('metoclient:previous', nextLayer);
              layer.set('title', '');
              return;
            }
            const baseId = layer.get('metoclient:id');
            layer.set('id', 'metoclient:' + baseId + '-previous');
            nextLayer.set('id', baseId);
            if (prevLayer != null) {
              prevLayer.set('id', 'metoclient:' + baseId + '-next');
            }
            nextLayer.set('metoclient:previous', layer);
            nextLayer.set('metoclient:next', prevLayer);
            nextLayer.set('title', layer.get('title'));
            layer.set('metoclient:previous', nextLayer);
            layer.set('title', '');
            SourceUpdater[nextSource.constructor.name](nextSource, visibleTime);
            return;
          }
        }
        SourceUpdater[source.constructor.name](source, this.config_.time);
      }
    });
    this.renderComplete_ = false;
    this.get('map').renderSync();
  }

  /**
   *
   * @private
   */
  updateTimeListener_ () {
    this.timeListener_ = this.get('map').on('change:time', this.timeUpdated_.bind(this));
  }

  getLayerSwitcherPanel_ () {
    return document.querySelector('div#' + constants.LAYER_SWITCHER_CONTAINER_ID + ' div.panel');
  }

  /**
   *
   * @private
   */
  createLegendChooser_() {
    const layerSwitcherPanel = this.getLayerSwitcherPanel_();
    if (layerSwitcherPanel == null) {
      return;
    }
    let legendChooserContainer = document.getElementById(constants.LEGEND_CHOOSER_CONTAINER_ID);
    if (legendChooserContainer != null) {
      return;
    }
    legendChooserContainer = document.createElement('div');
    legendChooserContainer.setAttribute('id', constants.LEGEND_CHOOSER_CONTAINER_ID);

    const legendSelectLabel = document.createElement('label');
    legendSelectLabel.setAttribute('id', constants.LEGEND_CHOOSER_LABEL_ID);
    legendSelectLabel.setAttribute('for', constants.LEGEND_CHOOSER_SELECT_ID);
    legendSelectLabel.innerHTML = this.config_.texts['Legend'];
    legendChooserContainer.appendChild(legendSelectLabel);

    const legendSelect = document.createElement('select');
    legendSelect.setAttribute('id', constants.LEGEND_CHOOSER_SELECT_ID);
    Object.keys(this.legends_).forEach((key) => {
      const legendOption = document.createElement('option');
      legendOption.value = key;
      legendOption.text = this.legends_[key].title;
      legendSelect.appendChild(legendOption);
    });
    legendSelect.value = this.selectedLegend_;
    legendSelect.addEventListener('change', (event) => {
      const selectedOption = legendSelect.options[legendSelect.selectedIndex];
      this.selectedLegend_ = selectedOption.value;
      const legendContainer = document.getElementById(constants.LEGEND_CONTAINER_ID);
      if (legendContainer != null) {
        while (legendContainer.firstChild) {
          legendContainer.removeChild(legendContainer.firstChild);
        }
        const url = this.legends_[selectedOption.value].url;
        if ((url != null) && (url.length > 0)) {
          const legendFigure = document.createElement('figure');
          const legendCaption = document.createElement('figcaption');
          legendCaption.innerHTML = selectedOption.text;
          legendFigure.appendChild(legendCaption);
          const legendImage = document.createElement('img');
          legendImage.setAttribute('src', url);
          legendFigure.appendChild(legendImage);
          legendContainer.appendChild(legendFigure);
        }
      }
    });
    legendChooserContainer.appendChild(legendSelect);
    layerSwitcherPanel.appendChild(legendChooserContainer);
    const layerList = layerSwitcherPanel.querySelector('ul');
    if (layerList != null) {
      layerList.addEventListener('change', (event) => {
        this.createLegendChooser_();
      });
    }
  }

  /**
   *
   * @private
   */
  createLayerSwitcherWatcher_() {
    if (this.layerSwitcherWatcher != null) {
      return;
    }
    const layerSwitcherPanel = this.getLayerSwitcherPanel_();
      // A workaround for https://github.com/walkermatt/ol-layerswitcher/issues/209
    if (layerSwitcherPanel != null) {
      this.layerSwitcherWatcher = new ElementVisibilityWatcher();
      this.layerSwitcherWatcher.watch(layerSwitcherPanel, (visible) => {
        if (visible) {
          this.createLegendChooser_();
        }
      });
    }
  }

  /**
   *
   * @private
   */
  createLegendContainer_ () {
    let mapContainer = document.getElementById(this.config_.target);
    if (mapContainer != null) {
      let legendContainer = document.createElement('div');
      legendContainer.setAttribute('id', constants.LEGEND_CONTAINER_ID);
      mapContainer.appendChild(legendContainer);
    }
  }

  /**
   *
   */
  createLegends_() {
    const map = this.get('map');
    if (map == null) {
      return;
    }
    const view = map.getView();
    if (view == null) {
      return;
    }
    // Todo: support resolutions
    // const resolution = view.getResolution();
    const layers = map.getLayers();
    this.legends_ = layers
      .getArray()
      .filter(layer => this.isAnimationLayer_(layer))
      .reduce((legendArray, layer) => {
        const source = layer.getSource();
        if ((source != null) && (typeof source['getLegendUrl'] === 'function')) {
          const legendUrl = source.getLegendUrl();
          legendArray[layer.get('id')] = {
            'title': layer.get('legendTitle'),
            'url': legendUrl
          }
        }
        return legendArray;
    }, {
      [constants.DEFAULT_LEGEND]: {
        title: '',
        url: null
      }
    });
    if (Object.entries(this.legends_).length > 1) {
      this.createLegendContainer_();
      this.createLayerSwitcherWatcher_();
    }
  }

  initMap_ (map) {
    this.set('map', map);
    map.addControl(new LayerSwitcher());
    const layerSwitcherContainer = document.querySelector('div#' + this.config_.target + ' div.layer-switcher');
    if (layerSwitcherContainer != null) {
      layerSwitcherContainer.setAttribute('id', constants.LAYER_SWITCHER_CONTAINER_ID);
      // https://github.com/walkermatt/ol-layerswitcher/issues/39
      const layerSwitcherButton = layerSwitcherContainer.querySelector('button');
      if (layerSwitcherButton != null) {
        layerSwitcherButton.onmouseover = () => {};
      }
      const layerSwitcherPanel = this.getLayerSwitcherPanel_();
      if (layerSwitcherPanel != null) {
        layerSwitcherPanel.onmouseout = () => {};
      }
    }
    this.createLegends_();
    this.renderComplete_ = true;
    this.timeSlider_.createTimeSlider(this.times_);
    this.playingListener_ = this.get('map').on('change:playing', evt => {
      if (this.get('map').get('playing')) {
        this.animate_();
      }
    });
    this.updateTimeListener_();
    this.nextListener_ = this.get('map').on('next', evt => {
      this.next();
    });
    this.previousListener_ = this.get('map').on('previous', evt => {
      this.previous();
    });
    map.set('time', this.config_.time);
    this.refreshTimer_ = interval(this.refresh_.bind(this), this.refreshInterval_);
    return map;
  }

  addTimes_ (times) {
    if ((times != null) && (Array.isArray(times)) && times.length > 0) {
      this.times_ = [...new Set([...this.times_, ...times])].sort();
    }
  }

  createVectorLayers_ (map, vectorConfig) {
    return olms(map, vectorConfig).then((updatedMap) => {
      if (vectorConfig.layers != null) {
        const mapProjection = updatedMap.getView().getProjection().getCode();
        updatedMap.getLayers().getArray().filter(layer => layer.get('mapbox-source') != null).forEach((layer) => {
          let layerConfig;
          const layerTimes = [];
          let timeProperty;
          const mapboxLayers = layer.get('mapbox-layers');
          if (mapboxLayers != null) {
            layer.set('id', mapboxLayers.join('-'));
            let title = mapboxLayers.reduce((layerTitle, layerId) => {
              layerConfig = vectorConfig.layers.find(layer => layer.id === layerId);
              if ((layerConfig.metadata != null) && (layerConfig.metadata.title != null) && (layerConfig.metadata.title.length > 0)) {
                if (layerTitle.length > 0) {
                  layerTitle += ' / ';
                }
                layerTitle += layerConfig.metadata.title;
                timeProperty = layerConfig.metadata.timeProperty;
              }
              return layerTitle;
            }, '');
            if ((title != null) && (title.length > 0)) {
              layer.set('title', title);
            }
          }
          if ((mapProjection !== 'EPSG:3857') || ((timeProperty != null) && (timeProperty.length > 0))) {
            layer.getSource().getFeatures().forEach((feature) => {
              if (mapProjection !== 'EPSG:3857') {
                feature.getGeometry().transform('EPSG:3857', mapProjection);
              }
              if ((timeProperty != null) && (timeProperty.length > 0)) {
                const time = feature.get(timeProperty);
                if ((time != null) && (time.length > 0)) {
                  const parsedTime = DateTime.fromISO(time).valueOf();
                  if ((typeof parsedTime === 'number') && (!Number.isNaN(parsedTime))) {
                    feature.setStyle(new Style({}));
                    feature.set('metoclient:time', parsedTime);
                    if (!layerTimes.includes(parsedTime)) {
                      layerTimes.push(parsedTime);
                    }
                  }
                }
              }
            });
          }
          layerTimes.sort();
          if (layerConfig != null) {
            if (layerConfig.time == null) {
              layerConfig.time = {};
            }
            layerConfig.time.data = layerTimes;
            layer.set('times', layerConfig.time.data);
          }
          this.addTimes_(layerTimes);
        });
        if ((this.config_.time == null) && (this.times_.length > 0)) {
          this.config_.time = this.times_[0];
        }
      }
      return updatedMap;
    });
  }

  /**
   *
   * @private
   */
  createMap_ () {
    this.timeSlider_ = new TimeSlider({
      locale: 'fi-FI',
      showTimeSlider: true,
      timeZone: this.config_.timeZone,
      timeZoneLabel: this.config_.timeZoneLabel
    });
    let newMap = new Map({
      target: this.config_.target,
      layers: this.createLayers_(),
      view: this.createView_(),
      controls: [
        new Zoom({
          'zoomInTipLabel': this.config_.texts['Zoom In'],
          'zoomOutTipLabel': this.config_.texts['Zoom Out'],
        }),
        this.timeSlider_
      ],
      interactions: [
        new DoubleClickZoom(),
        new DragPan(),
        new PinchZoom(),
        new KeyboardPan(),
        new KeyboardZoom()
      ]
    });
    if (this.vectorConfig_.layers.length > 0) {
      return this.createVectorLayers_(newMap, this.vectorConfig_).then((map) => this.initMap_(map));
    }
    return new Promise((resolve) => {
      resolve(this.initMap_(newMap));
    });
  }

  /**
   *
   * @private
   */
  updateMap_ () {
    let map = this.get('map');
    if (map == null) {
      return this.createMap_();
    }
    map.setTarget(this.config_.target);
    map.getLayerGroup().setLayers(this.createLayers_());
    map.setView(this.createView_());
    map.set('time', this.config_.time);
    this.updateTimeListener_();
    if (this.vectorConfig_.layers.length > 0) {
      return this.createVectorLayers_(map, this.vectorConfig_).then((updatedMap) => {
        this.timeUpdated_();
        return updatedMap;
      });
    }
    return new Promise((resolve) => {
      this.timeUpdated_();
      resolve(map);
    });
  }

  /**
   *
   * @private
   */
  updateTimes_ () {
    this.times_ = [];
    this.status_ = {};
    this.config_.layers.forEach(layer => {
      if ((layer.time != null) && (layer.time.range != null)) {
        const source = (layer.time.source != null) ? this.config_.sources[layer.time.source] : this.config_.sources[layer.source];
        const capabilities = this.capabilities_[source.tiles[0]]; // Generalize
        if ((capabilities == null) || (capabilities.data == null) || (capabilities.data.Capability == null) || (capabilities.data.Capability.Layer == null) || (capabilities.data.Capability.Layer.Layer == null)) {
          return;
        }
        const layerElement = capabilities.data.Capability.Layer.Layer.find(element => [layer.url.layer, layer.url.layers].includes(element.Name));
        const data = (layerElement != null) ? layerElement.Dimension.find(element => element.name.toLowerCase() === 'time').values : [];
        const parsedData = parseTimes(data);
        const times = parseTimes(layer.time.range, layer.time.offset, parsedData);
        const currentTime = Date.now();
        let historyData;
        let historyIndex = 0;
        let futureData;
        let futureIndex = 0;
        times.forEach((time, index) => {
          if (!isNaN(time) && !isFinite(time)) {
            if (time < 0) {
              if (historyData == null) {
                historyData = parsedData.filter(time => time < currentTime).sort().reverse();
              }
              times[index] = historyData[historyIndex];
              historyIndex++;
            } else {
              if (futureData == null) {
                futureData = parsedData.filter(time => time >= currentTime).sort();
              }
              times[index] = futureData[futureIndex];
              futureIndex++;
            }
          }
        });
        times.sort();
        layer.time.data = times.filter(time => parsedData.includes(time));
        this.addTimes_(layer.time.data);
      }
    });
    this.times_.forEach(time => {
      this.status_[time] = '';
    });
  }

  /**
   *
   * @api
   */
  play (options) {
    this.delay_ = (Math.sign(options.delay) > 0) ? options.delay : constants.DEFAULT_DELAY;
    this.periodDelay_ = (Math.sign(options.periodDelay) > 0) ? options.periodDelay : 2 * constants.DEFAULT_DELAY;
    this.get('map').set('playing', true);
  }

  /**
   *
   * @private
   */
  animate_ () {
    if (this.get('map').get('playing')) {
      if (this.renderComplete_) {
        this.waitingRender_ = 0;
        this.next();
        timeout(this.animate_.bind(this), this.delay_);
      } else {
        this.waitingRender_ = Date.now();
      }
    }
  }

  /**
   *
   * @returns {*}
   * @private
   */
  getNextTime_ () {
    const time = this.config_.time;
    const numTimes = this.times_.length;
    let timeIndex;
    for (let i = 0; i < numTimes; i++) {
      if (this.isVisibleTime_(this.times_[i])) {
        if (this.times_[i] > time) {
          timeIndex = i;
          break;
        }
        if (timeIndex == null) {
          timeIndex = i;
        }
      }
    }
    return this.times_[timeIndex];
  }

  /**
   *
   */
  next () {
    if (!this.isReady_()) {
      return;
    }
    this.get('map').set('time', this.getNextTime_());
  }

  /**
   *
   * @returns {*}
   * @private
   */
  getPrevTime_ () {
    const time = this.config_.time;
    const lastTimeIndex = this.times_.length - 1;
    let timeIndex;
    for (let i = lastTimeIndex; i >= 0; i--) {
      if (this.isVisibleTime_(this.times_[i])) {
        if (this.times_[i] < time) {
          timeIndex = i;
          break;
        }
        if (timeIndex == null) {
          timeIndex = i;
        }
      }
    }
    return this.times_[timeIndex];
  }

  /**
   *
   */
  previous () {
    if (!this.isReady_()) {
      return;
    }
    this.get('map').set('time', this.getPrevTime_());
  }

  /**
   *
   * @returns {boolean}
   * @private
   */
  isReady_ () {
    return (this.get('map') != null) && (this.times_.length > 0);
  }

  /**
   *
   * @api
   */
  pause () {
    this.get('map').set('playing', false);
  }


  stop () {
    this.pause();
  }

  /**
   *
   * @api
   */
  destroy () {
    unByKey(this.playingListener_);
    unByKey(this.nextListener_);
    unByKey(this.previousListener_);
    unByKey(this.timeListener_);
    this.timeSlider_.destroy();
  }

  /**
   *
   * @param coordinate
   * @param source
   * @param destination
   * @returns {import("./coordinate.js").Coordinate}
   */
  static transform (coordinate, source, destination) {
    proj4.defs('EPSG:3067', '+proj=utm +zone=35 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
    register(proj4);
    return transform(coordinate, source, destination);
  }
}

export default MetOClient;
