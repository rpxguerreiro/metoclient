/**
 * @fileoverview Common utility functions for working with animator.
 * @author Finnish Meteorological Institute
 * @license MIT
 */

import { tz } from 'moment-timezone'
import moment from 'moment-timezone'
import fi from 'moment/locale/fi'
import sv from 'moment/locale/sv'
import uk from 'moment/locale/uk'

/**
 * Floors time based on the given resolution.
 * @param {number} time Original time (ms).
 * @param {number} resolution Flooring resolution (ms).
 * @param {string=} userTimeZone Time zone.
 * @return {number} Floored time (ms).
 * @export
 */
export const floorTime = (time, resolution, userTimeZone) => {
  let date,
    hours,
    minutes,
    seconds,
    milliseconds,
    timeZone
  timeZone = (userTimeZone == null) ? 'UTC' : userTimeZone
  date = tz(time, timeZone)
  if (resolution < 1000) {
    milliseconds = date.milliseconds()
    date.milliseconds(milliseconds - milliseconds % resolution)
  } else if (resolution < 60 * 1000) {
    seconds = date.seconds()
    date.seconds(seconds - seconds % (resolution / 1000))
    date.milliseconds(0)
  } else if (resolution < 60 * 60 * 1000) {
    minutes = date.minutes()
    date.minutes(minutes - minutes % (resolution / (60 * 1000)))
    date.seconds(0)
    date.milliseconds(0)
  } else if (resolution < 24 * 60 * 60 * 1000) {
    hours = date.hours()
    date.hours(hours - hours % (resolution / (60 * 60 * 1000)))
    date.minutes(0)
    date.seconds(0)
    date.milliseconds(0)
  } else if (resolution < 7 * 24 * 60 * 60 * 1000) {
    date.hours(0)
    date.minutes(0)
    date.seconds(0)
    date.milliseconds(0)
  }
  return date.valueOf()
}

/**
 * Adds compatibility definitions for older browsers.
 */
export const supportOldBrowsers = () => {
  // http://paulirish.com/2011/requestanimationframe-for-smart-animating/
  // http://my.opera.com/emoller/blog/2011/12/20/requestanimationframe-for-smart-er-animating
  // requestAnimationFrame polyfill by Erik Möller. fixes from Paul Irish and Tino Zijdel
  // MIT license
  ((() => {
    let lastTime = 0
    const vendors = ['ms', 'moz', 'webkit', 'o']
    for (let x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
      window.requestAnimationFrame = window[`${vendors[x]}RequestAnimationFrame`]
      window.cancelAnimationFrame = window[`${vendors[x]}CancelAnimationFrame`] ||
        window[`${vendors[x]}CancelRequestAnimationFrame`]
    }

    if (!window.requestAnimationFrame) {
      window.requestAnimationFrame = (callback, element) => {
        const currTime = Date.now()
        const timeToCall = Math.max(0, 16 - (currTime - lastTime))
        const id = window.setTimeout(() => {
          callback(currTime + timeToCall)
        }, timeToCall)
        lastTime = currTime + timeToCall
        return id
      }
    }

    if (!window.cancelAnimationFrame) {
      window.cancelAnimationFrame = id => {
        clearTimeout(id)
      }
    }
  })())
}

/**
 * Generate an HTML list representing a dropdown menu.
 * @param {Object} options Menu data.
 * @return {HTMLElement} Unordered list of menu items.
 */
export const createMenu = (options) => {
  let ul = document.createElement('ul')
  let li
  let a
  ul.classList.add('metoclient-menu')
  if (options.id != null) {
    ul.setAttribute('id', 'window-menu-dots-' + options.id)
  }
  if (options.items != null) {
    options.items.forEach((item) => {
      li = document.createElement('li')
      a = document.createElement('a')
      a.href = '#'
      a.innerHTML = item.title
      li.appendChild(a)
      if (typeof item.callback === 'function') {
        li.addEventListener('click', item.callback)
      }
      ul.appendChild(li)
    })
  }
  return ul
}
