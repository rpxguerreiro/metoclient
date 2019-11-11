var fmi = fmi || {};
fmi.config = fmi.config || {};

fmi.config.metoclient = {
  'minZoom': 1,
  'maxZoom': 10,
  'center': [
    385956,
    6671437
  ],
  'zoom': 8,
  'container': 'map',
  'projection': 'EPSG:3067',
  'refreshInterval': 'PT15M',
  'timeZone': 'Europe/Helsinki',
  'sources': {
    'openwms': {
      'type': 'raster',
      'tiles': [
        'https://openwms.fmi.fi/geoserver/wms'
      ],
      'bounds': [
        -1214975,
        6518785,
        1179690,
        7850125
      ],
      'tileSize': 1024
    },
    'osm': {
      'type': 'raster',
      'tiles': [
        'https://avaa.tdata.fi/geoserver/osm_finland/gwc/service/wmts'
      ],
      'bounds': [
        -1214975,
        6518785,
        1179690,
        7850125
      ],
      'tileSize': 1024,
      'capabilities': 'osm-getcapabilities.xml'
    },
  },
  'layers': [
    {
      'id': 'basic-map',
      'type': 'raster',
      'source': 'osm',
      'metadata': {
        'type': 'base'
      },
      'url': {
        'service': 'WMTS',
        'layer': 'osm_finland:osm-finland',
        'tilematrixset': 'ETRS-TM35FIN-FINLAND',
        'style': '',
        'request': 'GetTile',
        'version': '1.0.0',
        'format': 'image/png'
      }
    },
    {
      'id': 'dbz-wms',
      'type': 'raster',
      'next': 'precipitation-wms',
      'source': 'openwms',
      'metadata': {
        'title': 'Weather radar'
      },
      'url': {
        'service': 'WMS',
        'layers': 'Radar:suomi_rr_eureffin',
        'version': '1.3.0',
        'request': 'GetMap',
        'format': 'image/png',
        'transparent': 'TRUE',
        'crs': 'EPSG:3067',
        'styles': '',
        'width': '1024',
        'height': '1024'
      },
      'time': {
        'range': 'every hour for 5 times history'
      }
    },
    {
      'id': 'precipitation-wms',
      'type': 'raster',
      'previous': 'dbz-wms',
      'source': 'openwms',
      'metadata': {
        'title': 'Precipitation forecast'
      },
      'url': {
        'service': 'WMS',
        'layers': 'Weather:precipitation-forecast',
        'version': '1.3.0',
        'request': 'GetMap',
        'format': 'image/png',
        'transparent': 'TRUE',
        'crs': 'EPSG:3067',
        'styles': '',
        'width': '1024',
        'height': '1024'
      },
      'time': {
        'range': 'every hour for 2 times history AND every hour for 10 times'
      }
    }
  ]
};
