/**
 * Utils module.
 *
 * @module utils
 */
import Url from 'domurl';
import { Duration, DateTime } from 'luxon';
import RRule from 'rrule/dist/es5/rrule';
import * as constants from './constants';

/**
 * Floor time based on the given resolution.
 *
 * @param {number} time Original timestamp (ms).
 * @param {number} resolution Flooring resolution (ms).
 * @returns {number} Floored timestamp (ms).
 */
export function floorTime(time, resolution) {
  return Math.floor(time / resolution) * resolution;
}

/**
 * Validate date.
 *
 * @param {Date} d The date to be validated.
 * @returns {boolean} Validation result.
 */
export function isValidDate(d) {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

/**
 * Update time array with time points of another array.
 *
 * @param {Array} times Array of time points to be updated.
 * @param {Array} newTimes Array of new time points.
 * @returns {Array} Updated time array.
 */
export function addNewTimes(times, newTimes) {
  const updatedTimes = [...times];
  newTimes.forEach(newTime => {
    if (!updatedTimes.includes(newTime)) {
      updatedTimes.push(newTime);
    }
  });
  return updatedTimes;
}

/**
 * Parse time point input.
 *
 * @param {} timeInput
 * @param timeOffset
 * @param timeData
 * @returns {}
 */
export function parseTimes(timeInput, timeOffset, timeData = null) {
  const DATE_TYPE = 'date';
  const DURATION_TYPE = 'period';
  const currentTime = Date.now();
  let times = [];

  if (timeInput == null) {
    times = [];
  } else if (Array.isArray(timeInput)) {
    times = timeInput.map(date => new Date(date).getTime());
  } else if (typeof timeInput === 'object') {
    const rule = new RRule(timeInput);
    const ruleTimes = rule.all().map(date =>
      DateTime.fromJSDate(date)
        .toUTC()
        .valueOf()
    );
    times = addNewTimes(times, ruleTimes);
  } else if (timeInput.includes(',')) {
    const dates = timeInput.split(',');
    times = dates.map(date => new Date(date).getTime());
  } else if (timeInput.includes('/')) {
    const parsedParts = timeInput.split('/').map(part => {
      if (part.toLowerCase() === constants.PRESENT) {
        return {
          value: Date.now(),
          type: DATE_TYPE
        };
      }
      const date = new Date(part);
      if (isValidDate(date)) {
        return {
          value: date.getTime(),
          type: DATE_TYPE
        };
      }
      try {
        const duration = Duration.fromISO(part).toObject();
        return {
          value: duration,
          type: DURATION_TYPE
        };
      } catch (e) {
        return {
          value: null,
          type: null
        };
      }
    });
    // Todo: if (parsedParts.length === 2) {} else
    if (
      parsedParts.length === 3 &&
      parsedParts[0].type === DATE_TYPE &&
      parsedParts[1].type === DATE_TYPE &&
      parsedParts[2].type === DURATION_TYPE
    ) {
      const duration = Duration.fromObject(parsedParts[2].value).as(
        'milliseconds'
      );
      let i = 0;
      let moment = parsedParts[0].value;
      while (moment <= parsedParts[1].value) {
        times.push(moment);
        i += 1;
        moment = parsedParts[0].value + i * duration;
      }
    }
  } else {
    const texts = timeInput.toLowerCase().split(' and ');
    texts
      .map(text => text.trim())
      .forEach(text => {
        const dataSteps = text.startsWith('data');
        if (dataSteps) {
          text = text.replace('data', 'every');
        }
        let rule;
        const parts = text.split(' ');
        if (parts.length >= 2) {
          const numTimes = Number(parts[0]);
          if (!Number.isNaN(numTimes) && parts[1].trim() === 'times') {
            times = times.concat(
              Array(numTimes).fill(
                parts.length >= 3 && parts[2] === 'history'
                  ? Number.NEGATIVE_INFINITY
                  : Number.POSITIVE_INFINITY
              )
            );
            return;
          }
        }
        const history = text.includes(' history');
        text = text.replace(' history', '');
        if (dataSteps) {
          text += ' for 2 times';
        }
        try {
          rule = RRule.fromText(text);
        } catch (err) {
          return;
        }
        if (!dataSteps) {
          if (rule.options.freq === RRule.HOURLY) {
            rule.options.byhour = Array.from(Array(24).keys()).filter(
              hour => hour % rule.options.interval === 0
            );
            rule.options.byminute = [0];
            rule.options.bysecond = [0];
            rule.options.interval = 1;
          } else if (rule.options.freq === RRule.MINUTELY) {
            rule.options.byminute = Array.from(Array(60).keys()).filter(
              minute => minute % rule.options.interval === 0
            );
            rule.options.bysecond = [0];
            rule.options.interval = 1;
          }
        }
        if (timeOffset != null) {
          let start = DateTime.fromJSDate(rule.options.dtstart);
          if (start != null) {
            const offsetDuration = Duration.fromISO(timeOffset);
            if (offsetDuration != null) {
              start = start.plus(offsetDuration);
              if (start != null) {
                rule.options.dtstart = start.toJSDate();
              }
            }
          }
        }
        let ruleTimes = rule.all().map(date =>
          DateTime.fromJSDate(date)
            .toUTC()
            .valueOf()
        );
        let offset;
        if (history) {
          const lastTimeStepIndex = ruleTimes.length - 1;
          if (lastTimeStepIndex === 0) {
            const tmpOptions = { ...rule.options };
            tmpOptions.count = 2;
            const tmpRule = new RRule(tmpOptions);
            const tmpRuleTimes = tmpRule.all();
            offset = tmpRuleTimes[1] - tmpRuleTimes[0];
          } else {
            offset =
              ((lastTimeStepIndex + 1) *
                (ruleTimes[lastTimeStepIndex] - ruleTimes[0])) /
              lastTimeStepIndex;
          }
          ruleTimes = ruleTimes.map(time => time - offset);
        }
        if (dataSteps) {
          timeData.forEach(dataTime => {
            if (
              (history &&
                dataTime >= ruleTimes[1] &&
                dataTime <= currentTime) ||
              (!history && dataTime <= ruleTimes[1] && dataTime >= currentTime)
            ) {
              times.push(dataTime);
            }
          });
        } else {
          times = addNewTimes(times, ruleTimes);
        }
      });
  }
  times.sort();
  return times;
}

/**
 * @param tiles
 * @param newTime
 */
export function updateSourceTime(tiles, newTime) {
  return tiles.map(tile => {
    const url = new Url(tile);
    let timeKey = 'time';
    Object.keys(url.query).forEach(key => {
      if (key.toLocaleLowerCase() === 'time') {
        timeKey = key;
      }
    });
    if (newTime != null) {
      url.query[timeKey] =
        typeof newTime === 'number' ? new Date(newTime).toISOString() : newTime;
    } else {
      delete url.query[timeKey];
    }
    return url.toString();
  });
}

/**
 * Url
 *
 * @param {string} baseUrl baseUrl
 * @param {string} params params
 * @returns {string} url
 */
export function stringifyUrl(baseUrl, params) {
  return Object.keys(params).reduce(
    (joined, paramKey, index) =>
      `${joined + (index > 0 ? '&' : '') + paramKey}=${
        typeof params[paramKey] === 'string' &&
        params[paramKey].match(/{([^}]+)}/g) === null
          ? encodeURIComponent(params[paramKey])
          : params[paramKey]
      }`,
    `${baseUrl.trim()}?`
  );
}

/**
 * createInterval
 *
 * @param {string} start start
 * @param {string} end end
 * @param {string} period period
 */
export function createInterval(start, end, period) {
  return `${start}/${end}/${period}`;
}

/**
 *
 *
 * @param url
 * @returns {string}
 */
export function getBaseUrl(url) {
  return url.split(/[?#]/)[0];
}

/**
 *
 *
 * @param direction
 * @param layer
 * @param layers
 */
export function getAdjacentLayer(direction, layer, layers) {
  const directions = ['previous', 'next'];
  const directionIndex = directions.indexOf(direction);
  if (directionIndex < 0) {
    return null;
  }
  if (layer[direction] != null) {
    return layer[direction];
  }
  const opposite = directions[(directionIndex + 1) % 2];
  const adjacentLayer = layers.find(l => l[opposite] === layer.id);
  if (adjacentLayer == null) {
    return null;
  }
  return adjacentLayer.id;
}
