import localforage from 'localforage'

const DEFAULT_CACHE_TIME = 10 * 60 * 1000

/**
 * Defines custom load function for layer tile and image loading.
 * @param image Layer image.
 * @param src Layer data source.
 */
export function loadFunction (image, src) {
  let self = this
  localforage.getItem(src, (err, cachedData) => {
    if ((err != null) || (cachedData == null) || (cachedData.dataUrl == null) || (cachedData.expires <= Date.now())) {
      urlToDataUrl(src, function (dataUrl) {
        image.getImage().src = dataUrl
        localforage.setItem(src, {
          dataUrl: dataUrl,
          expires: Date.now() + ((self.cacheTime != null) ? self.cacheTime : DEFAULT_CACHE_TIME)
        })
      })
    } else {
      image.getImage().src = cachedData.dataUrl
    }
  })
}

/**
 * Creates a data URL from source data located in a given URL.
 * @param url Source data URL.
 * @param callback Callback to be run after a new data URL is created.
 */
function urlToDataUrl (url, callback) {
  let xhr = new XMLHttpRequest()
  xhr.onload = function () {
    let reader = new FileReader()
    reader.onloadend = function () {
      callback(reader.result)
    }
    reader.readAsDataURL(xhr.response)
  }
  xhr.open('GET', url)
  xhr.responseType = 'blob'
  xhr.send()
}