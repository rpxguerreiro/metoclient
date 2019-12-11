/**
 * @module LayerCreator
 */
import TileLayer from 'ol/layer/Tile';
import ImageLayer from 'ol/layer/Image';
import ImageWMS from 'ol/source/ImageWMS';
import { OSM } from 'ol/source';
import SourceCreator from './SourceCreator';
import { getBaseUrl, getAdjacentLayer } from './util';

/**
 * Class abstracting layer creators for different layer types.
 */
export default class LayerCreator {
  /**
   * Create a tiled layer based on given configurations.
   *
   * @param {object} layer Layer configuration.
   * @param {object} options General options.
   * @param {object} capabilities Capabilities data.
   * @returns {null | object} Layer.
   */
  static tiled(layer, options, capabilities) {
    const sourceOptions = options.sources[layer.source];
    if (sourceOptions == null) {
      return null;
    }
    if (sourceOptions.type === 'OSM') {
      return new TileLayer({
        source: new OSM(),
        type: layer.metadata && layer.metadata.type ? layer.metadata.type : '',
        title:
          layer.metadata && layer.metadata.title ? layer.metadata.title : '',
        id: layer.id
      });
    }
    const service = layer.url.service.toLowerCase();
    if (typeof SourceCreator[service] === 'function') {
      const source = SourceCreator[service](layer, options, capabilities);
      return source != null
        ? new TileLayer({
            source,
            preload: 0,
            opacity: 0,
            type:
              layer.metadata && layer.metadata.type ? layer.metadata.type : '',
            title:
              layer.metadata && layer.metadata.title
                ? layer.metadata.title
                : '',
            previous: getAdjacentLayer('previous', layer, options.layers),
            next: getAdjacentLayer('next', layer, options.layers),
            legendTitle: layer.legendTitle,
            id: layer.id
          })
        : null;
    }
    return null;
  }

  /**
   * Create an image layer based on given configurations.
   *
   * @param {object} layer Layer configuration.
   * @param {object} options General options.
   * @returns {null | object} Layer.
   */
  static image(layer, options) {
    const source = options.sources[layer.source];
    if (
      source == null ||
      source.tiles[0] == null ||
      source.tiles[0].length === 0
    ) {
      return null;
    }
    // Todo: handle also non-zero indexes
    // Todo: add more options
    const url = getBaseUrl(source.tiles[0]);
    const timeDefined =
      layer.time != null && layer.time.data.includes(options.time);
    const layerUrl = { ...layer.url };
    if (timeDefined) {
      const timeFormatted = new Date(options.time).toISOString();
      layerUrl.TIME = timeFormatted;
    }
    const olSource = new ImageWMS({
      url,
      params: layerUrl
    });
    if (timeDefined) {
      olSource.set('metoclient:time', options.time);
    }

    return new ImageLayer({
      source: olSource,
      // Todo: use same code with tiled and image layer options
      preload: 0,
      opacity: 0,
      type: layer.metadata && layer.metadata.type ? layer.metadata.type : '',
      title: layer.metadata && layer.metadata.title ? layer.metadata.title : '',
      previous: getAdjacentLayer('previous', layer, options.layers),
      next: getAdjacentLayer('next', layer, options.layers),
      legendTitle: layer.legendTitle,
      id: layer.id
    });
  }
}
