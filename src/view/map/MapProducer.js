/**
 * @fileoverview Map source factory.
 * @author Finnish Meteorological Institute
 * @license MIT
 */

import OlLayerTile from 'ol/layer/tile'
import TileWMS from './TileWMS'
import ImageWMS from './ImageWMS'
import WMTS from './WMTS'
import Vector from './Vector'
import Stamen from './Stamen'
import OSM from './OSM'
import FeatureProducer from './FeatureProducer'
import * as constants from '../../constants'
import OlLayerImage from 'ol/layer/image'
import OlLayerVector from 'ol/layer/vector'
import OlStyleStyle from 'ol/style/style'

export default class MapProducer {
  /**
   * Creates a new layer source object.
   * @param {string} type Source type.
   * @param options Source options.
   * @param projection {string} Projection.
   * @returns {Array} Source.
   */
  sourceFactory (type, options, projection, beginTime, endTime) {
    if (options == null) {
      options = {}
    }
    if ((options['projection'] == null) && (projection != null)) {
      options['projection'] = projection
    }
    let typeLwr = type.toLowerCase()
    switch (typeLwr) {
      case 'tilewms':
        return new TileWMS(options)
      case 'imagewms':
        return new ImageWMS(options)
      case 'wmts':
        return new WMTS(options)
      case 'vector':
        return new Vector(options, projection, beginTime, endTime)
      case 'stamen':
        return new Stamen(options)
      case 'osm':
        return new OSM(options)
    }
  }

  /**
   * Creates a new layer.
   * @param options Layer options.
   * @param {Array} extent Extent of layer to be loaded.
   * @param projection {string} Projection.
   * @returns {Array} Layer.
   */
  layerFactory (options, extent, projection, beginTime, endTime) {
    let numStyles
    let style
    let extraStyles = [
      {
        'name': 'styleHover',
        'data': []
      }, {
        'name': 'styleSelected',
        'data': []
      }
    ]
    let i
    let z
    let featureProducer
    let typeLwr = options['className'].toLowerCase()
    let source
    let sourceKey = 'source'
    let animation
    let layerBeginTime = beginTime
    let layerEndTime = endTime
    if (options['sourceOptions'] !== undefined) {
      sourceKey += 'Options'
    }
    if (!((options[sourceKey] != null) && (options[sourceKey]['addFeature'] != null))) {
      animation = options['animation']
      if (animation != null) {
        if (animation['beginTime'] != null) {
          layerBeginTime = animation['beginTime']
        }
        if (animation['endTime'] != null) {
          layerEndTime = animation['endTime']
        }
      }
      source = this.sourceFactory(typeLwr, options[sourceKey], projection, layerBeginTime, layerEndTime)
    } else {
      source = options[sourceKey]
    }
    switch (typeLwr) {
      case 'tilewms':
      case 'wmts':
      case 'stamen':
      case 'osm':
        return new OlLayerTile({
          'extent': extent,
          'type': options['type'],
          'title': options['title'],
          'visible': options['visible'],
          'animation': options['animation'],
          'opacity': options['opacity'],
          'editOpacity': options['editOpacity'],
          'zIndex': options['zIndex'],
          'popupDataFMI': options['popupDataFMI'],
          'className': typeLwr,
          'source': source
        })
      case 'imagewms':
        return new OlLayerImage({
          'extent': extent,
          'type': options['type'],
          'title': options['title'],
          'visible': options['visible'],
          'animation': options['animation'],
          'opacity': options['opacity'],
          'editOpacity': options['editOpacity'],
          'zIndex': options['zIndex'],
          'popupDataFMI': options['popupDataFMI'],
          'className': typeLwr,
          'source': source
        })
      case 'vector':
        z = {
          'value': 0
        }
        options['source'] = source
        featureProducer = new FeatureProducer()
        if (Array.isArray(options['style'])) {
          numStyles = options['style'].length
          for (i = 0; i < numStyles; i++) {
            if (!(options['style'][i] instanceof OlStyleStyle)) {
              options['style'][i] = featureProducer.styleFactory(options['style'][i], z)
            }
          }
        }
        extraStyles.forEach((extraStyle) => {
          if (Array.isArray(options[extraStyle['name']])) {
            numStyles = options[extraStyle['name']].length
            for (i = 0; i < numStyles; i++) {
              if (!(options[extraStyle['name']][i] instanceof OlStyleStyle)) {
                style = featureProducer.styleFactory(options[extraStyle['name']][i], z)
                if (style != null) {
                  extraStyle['data'].push(style)
                }
              }
            }
          }
        })
        options['zIndex'] = constants.zIndex.vector + z['value']
        let layer = new OlLayerVector(options)
        layer.setZIndex(options['zIndex'])
        layer.set('extraStyles', extraStyles)
        return layer
    }
  }
}
