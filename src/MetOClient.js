/**
 * @fileoverview An entry point and main controller of the animator library.
 * @author Finnish Meteorological Institute
 * @license MIT
 */

import './config/globalExport'
import * as utils from './utils'
import * as constants from './constants'
import TimeController from './controller/TimeController'
import MapController from './controller/MapController'
import { tz } from 'moment-timezone'
import { default as proj4 } from 'proj4'
import extend from 'extend'

export class MetOClient {
  /**
   * Constructs a new animator main controller.
   * @param {Object} config User configuration.
   * @constructor
   */
  constructor (config) {
    let locale
    let project
    let mapPostId
    let newConfig = {
      'project': '',
      'map': {
        'model': {},
        'view': {}
      },
      'time': {
        'model': {},
        'view': {}
      },
      'localization': {}
    }

    /**
     * @type {Object}
     * @private
     */
    this.config_ = (config == null) ? extend(true, {}, newConfig) : this.rearrangeConfig(config)

    /**
     * @function
     * @private
     */
    this.reloadListener_ = () => {
    }
    /**
     * @function
     * @private
     */
    this.playListener_ = () => {
    }
    /**
     * @function
     * @private
     */
    this.refreshListener_ = () => {
    }
    /**
     * @function
     * @param {number} numIntervalItems Number of interval items.
     * @private
     */
    this.numIntervalItemsListener_ = (numIntervalItems) => {
    }
    /**
     * @function
     * @param {number} animationTime Animation time.
     * @private
     */
    this.animationTimeListener_ = animationTime => {
    }

    // Configuration from default values
    extend(true, newConfig, this.getDefaultConfig())
    // Configuration from newConfiguration files
    project = (this.config_['project'] == null) ? newConfig['project'] : this.config_['project']
    if ((project) && (window['fi']) && (window['fi']['fmi']) && (window['fi']['fmi']['config']) && (window['fi']['fmi']['config']['metoclient'])) {
      extend(true, newConfig, this.rearrangeConfig(window['fi']['fmi']['config']['metoclient'][project]))
    }
    this.config_['map']['view']['project'] = project

    // Configuration from parameter values
    this.config_ = extend(true, newConfig, this.config_)
    // The map model might be too slow to extend because of large vector data sets
    this.config_['map']['model']['layers'] = config['layers']

    if (this.config_['time']['model']['gridTime'] == null) {
      this.config_['time']['model']['gridTime'] = (this.config_['time']['model']['resolutionTime'] != null) ? Math.max(constants.DEFAULT_GRID_TIME, this.config_['time']['model']['resolutionTime']) : constants.DEFAULT_GRID_TIME
    }

    mapPostId = 0
    while (document.getElementById(`${this.config_['map']['view']['mapContainer']}-${mapPostId}`) != null) {
      mapPostId++
    }
    this.config_['map']['view']['mapContainer'] += `-${mapPostId}`

    // Localization
    if (this.config_['localization']['locale'] != null) {
      locale = this.config_['localization']['locale']
      this.config_['map']['view']['overlayGroupName'] = this.config_['localization'][locale]['overlays']
      this.config_['map']['view']['staticOverlayGroupName'] = this.config_['localization'][locale]['staticOverlays']
      this.config_['map']['view']['baseGroupName'] = this.config_['localization'][locale]['baseLayers']
      this.config_['map']['view']['featureGroupName'] = this.config_['localization'][locale]['features']
      this.config_['map']['view']['opacityTitle'] = this.config_['localization'][locale]['opacity']
      this.config_['map']['view']['legendTitle'] = this.config_['localization'][locale]['legend']
      this.config_['map']['view']['noLegendText'] = this.config_['localization'][locale]['noLegend']
      this.config_['map']['view']['zoomInTooltip'] = this.config_['localization'][locale]['zoomInTooltip']
      this.config_['map']['view']['zoomOutTooltip'] = this.config_['localization'][locale]['zoomOutTooltip']
      this.config_['map']['view']['layersTooltip'] = this.config_['localization'][locale]['layersTooltip']
      this.config_['time']['view']['locale'] = this.config_['localization']['locale']
    }
    /**
     * @private
     */
    this.timeController_ = new TimeController(this.config_['time'])
    /**
     * @private
     */
    this.mapController_ = new MapController(this.config_['map'], this.timeController_.getCreationTime())
  };

  /**
   * Restructure configuration for class implementation.
   * @param userConfig User configuration.
   * @returns {Object} Nested configuration.
   */
  rearrangeConfig (userConfig) {
    let config = {
      'project': userConfig['project'],
      'map': {
        'model': {},
        'view': {}
      },
      'time': {
        'model': {},
        'view': {}
      },
      'localization': userConfig['localization']
    }
    let mapView = [
      'asyncLoadDelay',
      'baseGroupName',
      'container',
      'defaultCenterLocation',
      'defaultCenterProjection',
      'defaultMaxZoom',
      'defaultMinZoom',
      'defaultZoomLevel',
      'extent',
      'featureGroupName',
      'ignoreObsOffset',
      'interactions',
      'layerSwitcherContainer',
      'legendContainer',
      'legendLabel',
      'mapContainer',
      'markerImagePath',
      'maxAsyncLoadCount',
      'noLegendText',
      'overlayGroupName',
      'projection',
      'resolutions',
      'showLayerSwitcher',
      'showLegend',
      'showLoadProgress',
      'showMarker',
      'spinnerContainer',
      'staticControls',
      'staticOverlayGroupName'
    ]
    let timeModel = [
      'autoReplay',
      'autoStart',
      'beginTime',
      'defaultAnimationTime',
      'endTime',
      'endTimeDelay',
      'frameRate',
      'gridTime',
      'gridTimeOffset',
      'refreshInterval',
      'resolutionTime',
      'waitUntilLoaded'
    ]
    let timeView = [
      'locale',
      'showTimeSlider',
      'timeSliderContainer',
      'timeZone',
      'timeZoneLabel',
      'vertical'
    ]

    mapView.forEach(propertyName => {
      if (userConfig[propertyName] != null) {
        config['map']['view'][propertyName] = userConfig[propertyName]
      }
    })

    timeModel.forEach(propertyName => {
      if (userConfig[propertyName] != null) {
        config['time']['model'][propertyName] = userConfig[propertyName]
      }
    })
    timeView.forEach(propertyName => {
      if (userConfig[propertyName] != null) {
        config['time']['view'][propertyName] = userConfig[propertyName]
      }
    })
    return config
  };

  /**
   * Static getter for an utility function floorTime.
   * @return {function} Function to floor a time based on given resolution.
   * @export
   */
  static get floorTime () {
    return utils['floorTime']
  };

  /**
   * Static getter for an utility function createMenu.
   * @return {function} Function to generate dropdown menu used in MetOClient.
   * @export
   */
  static get createMenu () {
    return utils['createMenu']
  };

  /**
   * Transforms coordinates between projections.
   * @param fromProjection {string} Source projection.
   * @param toProjection {string} Target projection.
   * @param coordinates {number[]} Coordinates to be transformed.
   * @return {number[]} Transformed coordinates.
   * @export
   */
  static transformCoordinates (fromProjection, toProjection, coordinates) {
    return proj4(fromProjection, toProjection, coordinates)
  };

  /**
   * Produces a new time model and views.
   */
  createTime () {
    this.timeController_.createTime()
  };

  /**
   * Produces a new map model and view.
   * @param {Object=} callbacks Callback functions for map events.
   */
  createMap (callbacks) {
    let mapCallbacks = null
    if (callbacks != null) {
      mapCallbacks = callbacks
    }
    this.mapController_.createMap(
      this.timeController_.getCurrentTime(),
      this.timeController_.getAnimationTime(),
      this.timeController_.getAnimationBeginTime(),
      this.timeController_.getAnimationEndTime(),
      this.timeController_.getAnimationResolutionTime(),
      this.timeController_.getAnimationNumIntervals(),
      mapCallbacks
    )
  };

  /**
   * Gets a default configuration.
   * @returns {Object}
   */
  getDefaultConfig () {
    return {
      'project': 'default',
      'map': {
        'model': {
          'layers': {}
        },
        'view': {
          'container': 'fmi-metoclient',
          'projection': 'EPSG:3067',
          'defaultMinZoom': 0,
          'defaultMaxZoom': 15,
          'defaultCenterLocation': [389042, 6673664],
          'defaultCenterProjection': 'EPSG:3067',
          'defaultZoomLevel': 5,
          'extent': [50199.4814, 6582464.0358, 761274.6247, 7799839.8902],
          'mapContainer': 'fmi-metoclient-map',
          'layerSwitcherContainer': 'fmi-metoclient-layer-switcher',
          'legendContainer': 'fmi-metoclient-legend',
          'spinnerContainer': 'fmi-metoclient-spinner',
          'showLoadProgress': false,
          'staticControls': false,
          'overlayGroupName': 'Overlays',
          'baseGroupName': 'Base layers',
          'featureGroupName': 'Features',
          'staticOverlayGroupName': 'Static overlays',
          'showLayerSwitcher': true,
          'showLegend': true,
          'legendLabel': 'Legend',
          'noLegendText': 'None',
          'maxAsyncLoadCount': 5,
          'asyncLoadDelay': 10,
          'ignoreObsOffset': 0,
          'showMarker': false,
          'markerImagePath': '../img/marker.png',
          'interactions': {
            'pinchRotate': false,
            'altShiftDragRotate': false
          }
        }
      },
      'time': {
        'model': {
          'autoStart': false,
          'waitUntilLoaded': false,
          'autoReplay': true,
          'refreshInterval': 15 * 60 * 1000,
          'frameRate': 500,
          'beginTime': Date.now(),
          'endTime': Date.now(),
          'endTimeDelay': 0,
          'defaultAnimationTime': Date.now(),
          'gridTimeOffset': 0
        },
        'view': {
          'vertical': false,
          'timeSliderContainer': 'fmi-metoclient-timeslider',
          'showTimeSlider': true,
          'locale': 'en',
          'timeZone': tz.guess(),
          'timeZoneLabel': ''
        }
      },
      'localization': {
        'locale': 'en',
        'fi': {
          'opacity': 'Peittokyky',
          'overlays': 'Sääaineistot',
          'baseLayers': 'Taustakartat',
          'features': 'Kohteet',
          'staticOverlays': 'Merkinnät',
          'legend': 'Selite',
          'noLegend': 'Ei selitettä',
          'zoomInTooltip': 'Lähennä',
          'zoomOutTooltip': 'Loitonna',
          'layersTooltip': 'Karttatasot',
          'browserNotSupported': 'Tämä selain ei ole tuettu.'
        },
        'sv': {
          'opacity': 'Opacitet',
          'overlays': 'Väder data',
          'baseLayers': 'Bakgrundskartor',
          'features': 'Objekter',
          'staticOverlays': 'Statisk data',
          'legend': 'Legend',
          'noLegend': 'Ingen legend',
          'zoomInTooltip': 'Zooma in',
          'zoomOutTooltip': 'Zooma ut',
          'layersTooltip': 'Nivåer',
          'browserNotSupported': 'Webbläsaren stöds inte.'
        },
        'en': {
          'opacity': 'Opacity',
          'overlays': 'Overlays',
          'baseLayers': 'Base layers',
          'features': 'Features',
          'staticOverlays': 'Static overlays',
          'legend': 'Legend',
          'noLegend': 'None',
          'zoomInTooltip': 'Zoom in',
          'zoomOutTooltip': 'Zoom out',
          'layersTooltip': 'Layers',
          'browserNotSupported': 'This browser is not supported.'
        }
      }
    }
  };

  /**
   * Initializes DOM element containers.
   */
  initContainers () {
    const animatorContainerIdOrClass = this.config_['map']['view']['container']
    const mapContainerIdOrClass = this.config_['map']['view']['mapContainer']
    const legendContainerClass = this.config_['map']['view']['legendContainer']
    const spinnerContainerClass = this.config_['map']['view']['spinnerContainer']
    const timeSliderContainerClass = this.config_['time']['view']['timeSliderContainer']
    let animatorContainers
    let animatorContainer
    let animatorContainerId
    let animatorContainerClass
    let mapContainer
    let popupContainer
    let popupCloser
    let popupContent
    let legendContainer
    let spinnerContainer
    let timeSliderContainer

    if (!animatorContainerIdOrClass) {
      return
    }

    let parseClassList = classList => {
      return classList
        .split(' ')
        .map(classItem => classItem.trim())
        .filter(classItem => classItem.length > 0)
    }

    let addClassListToContainer = (classList, container) => {
      parseClassList(classList).forEach(classItem => {
        container.classList.add(classItem)
      })
    }
    animatorContainerId = animatorContainerIdOrClass
    if (animatorContainerId.charAt(0) === '#') {
      animatorContainerId = animatorContainerIdOrClass.substr(1)
    }
    animatorContainer = document.getElementById(animatorContainerId)
    if (animatorContainer == null) {
      animatorContainerClass = animatorContainerIdOrClass.replace(/\./g, ' ');
      animatorContainers = document.getElementsByClassName(animatorContainerClass)
      if (animatorContainers.length === 0) {
        return
      }
      animatorContainer = animatorContainers.item(0)
      animatorContainer.setAttribute('id', animatorContainerIdOrClass)
    }
    mapContainer = document.createElement('div')
    addClassListToContainer(mapContainerIdOrClass, mapContainer)
    mapContainer.classList.add('metoclient-map')
    mapContainer.setAttribute('id', mapContainerIdOrClass)
    legendContainer = document.createElement('div')
    addClassListToContainer(legendContainerClass, legendContainer)
    mapContainer.appendChild(legendContainer)
    spinnerContainer = document.createElement('div')
    addClassListToContainer(spinnerContainerClass, spinnerContainer)
    spinnerContainer.style.display = 'none'
    mapContainer.appendChild(spinnerContainer)
    timeSliderContainer = document.createElement('div')
    addClassListToContainer(timeSliderContainerClass, timeSliderContainer)
    mapContainer.appendChild(timeSliderContainer)
    animatorContainer.innerHTML = ''
    animatorContainer.appendChild(mapContainer)

    popupContainer = document.createElement('div')
    popupContainer.classList.add('ol-popup')
    popupContainer.setAttribute('id', `${mapContainerIdOrClass}-popup`)
    popupContainer.style.display = 'none'
    popupCloser = document.createElement('a')
    popupCloser.classList.add('ol-popup-closer')
    popupCloser.setAttribute('id', `${mapContainerIdOrClass}-popup-closer`)
    popupCloser.setAttribute('href', '#')
    popupContainer.appendChild(popupCloser)
    popupContent = document.createElement('div')
    popupContent.setAttribute('id', `${mapContainerIdOrClass}-popup-content`)
    popupContainer.appendChild(popupContent)
    animatorContainer.appendChild(popupContainer)

    // Debug div for mobile devices
    // jQuery(divElement).attr('id','fmi-debug-div').width('320px').height('200px').css({'background-color':'#EEEEEE', 'position':'absolute', 'right': '0px'}).appendTo(animatorContainer);
  };

  /**
   * Sets animation begin time.
   * @param {number} beginTime Animation begin time.
   * @export
   */
  setTimeBegin (beginTime) {
    this.timeController_.setBeginTime(beginTime)
    this.refresh()
  };

  /**
   * Sets animation end time.
   * @param {number} endTime Animation end time.
   * @export
   */
  setTimeEnd (endTime) {
    this.timeController_.setEndTime(endTime)
    this.refresh()
  };

  /**
   * Sets animation time step.
   * @param {number} timeStep Animation time step.
   * @export
   */
  setTimeStep (timeStep) {
    this.timeController_.setTimeStep(timeStep)
    this.refresh()
  };

  /**
   * Updates animation.
   * @param {Object} options Animation options.
   * @param {Object=} callbacks Callback functions for map events.
   * @export
   */
  updateAnimation (options, callbacks) {
    if (typeof options['beginTime'] !== 'undefined') {
      this.timeController_.setBeginTime(options['beginTime'])
    }
    if (typeof options['endTime'] !== 'undefined') {
      this.timeController_.setEndTime(options['endTime'])
    }
    if (typeof options['timeStep'] !== 'undefined') {
      this.timeController_.setTimeStep(options['timeStep'])
    }
    if (typeof options['timeZone'] !== 'undefined') {
      this.timeController_.setTimeZone(options['timeZone'])
    }
    if (typeof options['timeZoneLabel'] !== 'undefined') {
      this.timeController_.setTimeZoneLabel(options['timeZoneLabel'])
    }
    if (typeof options['layers'] !== 'undefined') {
      this.mapController_.setLayers(options['layers'])
    }
    this.timeController_.createTimer()
    if (typeof options['animationTime'] !== 'undefined') {
      this.timeController_.setAnimationTime(options['animationTime'])
    }
    this.refresh(callbacks)
  };

  /**
   * Destroys animation.
   * @export
   */
  destroyAnimation () {
    this.mapController_.destroyAnimation()
    this.timeController_.destroyTime()
  };

  /**
   * Sets animation speed.
   * @param frameRate Animation speed.
   * @export
   */
  setFrameRate (frameRate) {
    this.timeController_.setFrameRate(frameRate)
  };

  /**
   * Sets animation speed.
   * @param frameRate Animation speed.
   * @export
   * @deprecated
   */
  setTimeRate (frameRate) {
    this.timeController_.setFrameRate(frameRate)
  };

  /**
   * Sets animation time zone.
   * @param {string} timeZone Animation time zone.
   * @export
   */
  setTimeZone (timeZone) {
    this.timeController_.setTimeZone(timeZone)
    this.createTimeSlider()
  };

  /**
   * Sets time zone label.
   * @param {string} timeZoneLabel Time zone label.
   * @export
   */
  setTimeZoneLabel (timeZoneLabel) {
    this.timeController_.setTimeZoneLabel(timeZoneLabel)
    this.createTimeSlider()
  };

  /**
   * Refreshes animation data.
   * @param {Object=} callbacks Callback functions for map events.
   * @export
   */
  refresh (callbacks) {
    this.timeController_.refreshTime()
    this.createMap(callbacks)
  };

  /**
   * Starts to play animation.
   * @export
   */
  play () {
    this.timeController_.play()
  };

  /**
   * Pauses animation.
   * @export
   */
  pause () {
    this.timeController_.pause()
  };

  /**
   * Stops (pauses and rewinds) animation.
   * @export
   */
  stop () {
    this.timeController_.stop()
  };

  /**
   * Moves to previous time frame.
   * @export
   */
  previous () {
    this.timeController_.previous()
  };

  /**
   * Sets map zoom level.
   * @param {number} level Zoom level.
   * @export
   */
  setZoom (level) {
    this.mapController_.setZoom(level)
  };

  /**
   * Sets map center.
   * @param {number} x X coordinate.
   * @param {number} y Y coordinate.
   * @export
   */
  setCenter (x, y) {
    this.mapController_.setCenter([x, y])
  };

  /**
   * Sets map rotation.
   * @param {number} angle Rotation.
   * @export
   */
  setRotation (angle) {
    this.mapController_.setRotation(angle)
  };

  /**
   * Gets the animation map.
   * @return {Object} Animation map.
   * @export
   */
  getMap () {
    return this.mapController_.getMap()
  };

  /**
   * Gets current time as a timestamp.
   * @return {number} Current time.
   * @export
   */
  getTime () {
    return this.timeController_.getAnimationTime()
  };

  /**
   * Sets current time frame.
   * @param animationTime {number} Timestamp of new time frame.
   * @export
   */
  setTime (animationTime) {
    this.timeController_.setAnimationTime(animationTime)
  };

  /**
   * Adds features to vector layer.
   * @param layerTitle {string} Vector layer title.
   * @param projection {string} Projection.
   * @param featureOptions {Array<Object>} New feature options.
   * @export
   */
  addFeatures (layerTitle, projection, featureOptions) {
    this.mapController_.addFeatures(layerTitle, projection, featureOptions)
  };

  /**
   * Removes all features from a vector layer.
   * @param layerTitle {string} Vector layer title.
   * @export
   */
  clearFeatures (layerTitle) {
    this.mapController_.clearFeatures(layerTitle)
  };

  /**
   * Gets vector layer features.
   * @param layerTitle {string} Vector layer title.
   * @return {Array<Object>} Features.
   * @export
   */
  getFeatures (layerTitle) {
    return this.mapController_.getFeatures(layerTitle)
  };

  /**
   * Gets vector layer features at given location.
   * @param layerTitle {string} Vector layer title.
   * @param x {number} Feature X coordinate.
   * @param y {number} Feature Y coordinate.
   * @param tolerance {number} Coordinate resolution in pixels.
   * @return {Array<Object>} Features.
   * @export
   */
  getFeaturesAt (layerTitle, x, y, tolerance) {
    return this.mapController_.getFeaturesAt(layerTitle, [x, y], tolerance)
  };

  /**
   * Shows a popup window on the map.
   * @param content {string} HTML content of the popup window.
   * @param x {number} Popup X coordinate.
   * @param y {number} Popup Y coordinate.
   * @export
   */
  showPopup (content, x, y) {
    this.mapController_.showPopup(content, [x, y])
  };

  /**
   * Hides popup window on the map.
   * @export
   */
  hidePopup () {
    this.mapController_.hidePopup()
  };

  /**
   * Gets a map layer.
   * @param layerTitle {string} Layer title.
   * @return {Object} Map layer.
   * @export
   */
  getLayer (layerTitle) {
    return this.mapController_.getLayer(layerTitle)
  };

  /**
   * Request a map view update.
   * @export
   */
  requestViewUpdate () {
    this.mapController_.requestViewUpdate()
  };

  /**
   * Sets layer visibility.
   * @param layerTitle {string} Layer title.
   * @param visibility {boolean} Layer visibility.
   * @export
   */
  setLayerVisible (layerTitle, visibility) {
    this.mapController_.setLayerVisible(layerTitle, visibility)
  };

  /**
   * Sets map interactions.
   * @param interactionOptions {Object} Interaction options.
   * @export
   */
  setInteractions (interactionOptions) {
    this.mapController_.setInteractions(interactionOptions)
  };

  /**
   * Enables or disables static map controls.
   * @param staticControls {boolean} Static controls status.
   * @export
   */
  setStaticControls (staticControls) {
    this.mapController_.setStaticControls(staticControls)
  };

  /**
   * Returns static map controls status.
   * @return {boolean} Static controls status.
   * @export
   */
  getStaticControls () {
    return this.mapController_.getStaticControls()
  };

  /**
   * Sets callback functions.
   * @param callbacks {Object} Callback functions.
   * @export
   */
  setCallbacks (callbacks) {
    this.mapController_.setCallbacks(callbacks)
  };

  /**
   * Sets time grid offset from midnight.
   * @param gridTimeOffset {Number} Time grid offset.
   * @export
   */
  setDayStartOffset (gridTimeOffset) {
    this.timeController_.setDayStartOffset(gridTimeOffset)
  };

  /**
   * Sets the capabilities data corresponding to a given url.
   * @param {Object} capabilities Capabilities data.
   * @export
   */
  setCapabilities (capabilities) {
    this.mapController_.setCapabilities(capabilities)
  };

  /**
   * Destructor.
   * @export
   */
  destruct () {
    this.destroyAnimation()
    this.mapController_ = null
    this.timeController_ = null
  };

  /**
   * Produces a new animation.
   * @param {Object=} callbacks Callback functions for map events.
   * @return {MetOClient} Owner class.
   * @export
   */
  createAnimation (callbacks) {
    let self = this
    utils.supportOldBrowsers()
    this.initContainers()
    this.reloadListener_ = () => {
    }
    this.mapController_.actionEvents.addListener('reload', this.reloadListener_)
    this.playListener_ = () => {
      self.play()
    }
    this.timeController_.actionEvents.addListener('play', this.playListener_)
    this.refreshListener_ = () => {
      self.refresh()
    }
    this.timeController_.actionEvents.addListener('refresh', this.refreshListener_)
    this.animationTimeListener_ = animationTime => {
      self.mapController_.setAnimationTime(animationTime)
    }
    this.timeController_.variableEvents.addListener('animationTime', this.animationTimeListener_)
    this.numIntervalItemsListener_ = numIntervalItems => {
      self.timeController_.updateTimeSteps(numIntervalItems)
    }
    this.mapController_.variableEvents.addListener('numIntervalItems', this.numIntervalItemsListener_)

    this.createTime()
    this.createMap(callbacks)
    return this
  };

  /**
   * Refreshes the map.
   * @export
   */
  refreshMap () {
    this.mapController_.refreshMap()
  };

  /**
   * Creates a time slider for each view.
   * @export
   */
  createTimeSlider () {
    this.timeController_.createTimeSlider()
  };
}
