import {
  getRefinements,
  clearRefinementsFromState,
  clearRefinementsAndSearch,
} from '../../lib/utils.js';

import isUndefined from 'lodash/isUndefined';
import isBoolean from 'lodash/isBoolean';
import isString from 'lodash/isString';
import isArray from 'lodash/isArray';
import isPlainObject from 'lodash/isPlainObject';
import isFunction from 'lodash/isFunction';
import isEmpty from 'lodash/isEmpty';

import map from 'lodash/map';
import reduce from 'lodash/reduce';
import filter from 'lodash/filter';

const usage = `Usage:
var customCurrentRefinedValues = connectCurrentRefinedValues(function renderFn(params, isFirstRendering) {
  // params = {
  //   attributes,
  //   clearAllClick,
  //   clearAllPosition,
  //   clearAllURL,
  //   clearRefinementClicks,
  //   clearRefinementURLs,
  //   refinements,
  //   instantSearchInstance,
  //   widgetParams,
  // }
});
search.addWidget(
  customCurrentRefinedValues({
    [ attributes = [] ],
    [ onlyListedAttributes = false ],
  })
);
Full documentation available at https://community.algolia.com/instantsearch.js/connectors/connectCurrentRefinedValues.html
`;

/**
 * @typedef {Object} CurrentRefinedValuesRenderingOptions
 * @property {Object.<string, object>} attributes attributes mapped by keys
 * @property {function} clearAllClick function to trigger the clear of all the currently refined values
 * @property {string} clearAllPosition position of the 'clear all' button
 * @property {function} clearAllURL url which leads to a state where all the refinements have been cleared
 * @property {function[]} clearRefinementClicks individual clearing function per refinement
 * @property {string[]} clearRefinementURLs individual url where a single refinement is cleared
 * @property {Refinements[]} refinements all the current refinements
 * @property {InstantsSearch} instantSearchInstance the instance of instantsearch.js
 * @property {Object} widgetParams all original options forwarded to rendering
 */

/**
 * @typedef {Object} CurrentRefinedValuesAttributes
 * @property {string} name mandatory field which is the name of the attribute
 * @property {string} label the label to apply on a refinement per attribute
 * @property {string|function} template the template to apply
 * @property {function} transformData function to transform the content of the refinement before rendering the template
 */

/**
 * @typedef {Object} CurrentRefinedValuesWidgetOptions
 * @property {CurrentRefinedValuesAttributes[]} attributes specification for the display of refinements per attribute
 * @property {boolean} onlyListedAttributes limit the displayed refinement to the list specified
 */

/**
 * Creactes a currentRefinedValues widget with a custom rendering.
 * @function connectCurrentRefinedValues
 * @param {function(CurrentRefinedValuesRenderingOptions)} renderCurrentRefinedValues the custom rendering function
 * @return {function(CurrentRefinedValuesWidgetOptions): CurrentRefinedValuesWidget} a function that creates CurrentRefinedValues widget
 */
const connectCurrentRefinedValues = renderCurrentRefinedValues => (widgetParams = {}) => {
  const {attributes = [], onlyListedAttributes = false} = widgetParams;
  const attributesOK = isArray(attributes) &&
    reduce(
      attributes,
      (res, val) =>
        res &&
          isPlainObject(val) &&
          isString(val.name) &&
          (isUndefined(val.label) || isString(val.label)) &&
          (isUndefined(val.template) || isString(val.template) || isFunction(val.template)) &&
          (isUndefined(val.transformData) || isFunction(val.transformData)),
      true);

  const showUsage = false ||
    !isArray(attributes) ||
    !attributesOK ||
    !isBoolean(onlyListedAttributes);

  if (showUsage) {
    throw new Error(usage);
  }

  const attributeNames = map(attributes, attribute => attribute.name);
  const restrictedTo = onlyListedAttributes ? attributeNames : [];

  const attributesObj = reduce(attributes, (res, attribute) => {
    res[attribute.name] = attribute;
    return res;
  }, {});

  return {
    init({helper, createURL, instantSearchInstance}) {
      this._clearRefinementsAndSearch = clearRefinementsAndSearch.bind(null, helper, restrictedTo);

      const clearAllURL = createURL(clearRefinementsFromState(helper.state, restrictedTo));

      const refinements = getFilteredRefinements({}, helper.state, attributeNames, onlyListedAttributes);
      const clearRefinementURLs =
        refinements.map(refinement => createURL(clearRefinementFromState(helper.state, refinement)));
      const clearRefinementClicks = refinements.map(refinement => clearRefinement.bind(null, helper, refinement));

      renderCurrentRefinedValues({
        attributes: attributesObj,
        clearAllClick: this._clearRefinementsAndSearch,
        clearAllURL,
        clearRefinementClicks,
        clearRefinementURLs,
        refinements,
        instantSearchInstance,
        widgetParams,
      }, true);
    },
    render({results, helper, state, createURL, instantSearchInstance}) {
      const clearAllURL = createURL(clearRefinementsFromState(state, restrictedTo));

      const refinements = getFilteredRefinements(results, state, attributeNames, onlyListedAttributes);
      const clearRefinementURLs = refinements.map(refinement => createURL(clearRefinementFromState(state, refinement)));
      const clearRefinementClicks = refinements.map(refinement => clearRefinement.bind(null, helper, refinement));

      renderCurrentRefinedValues({
        attributes: attributesObj,
        clearAllClick: this._clearRefinementsAndSearch,
        clearAllURL,
        clearRefinementClicks,
        clearRefinementURLs,
        refinements,
        instantSearchInstance,
        widgetParams,
      }, false);
    },
  };
};

function getRestrictedIndexForSort(attributeNames, otherAttributeNames, attributeName) {
  const idx = attributeNames.indexOf(attributeName);
  if (idx !== -1) {
    return idx;
  }
  return attributeNames.length + otherAttributeNames.indexOf(attributeName);
}

function compareRefinements(attributeNames, otherAttributeNames, a, b) {
  const idxa = getRestrictedIndexForSort(attributeNames, otherAttributeNames, a.attributeName);
  const idxb = getRestrictedIndexForSort(attributeNames, otherAttributeNames, b.attributeName);
  if (idxa === idxb) {
    if (a.name === b.name) {
      return 0;
    }
    return a.name < b.name ? -1 : 1;
  }
  return idxa < idxb ? -1 : 1;
}

function getFilteredRefinements(results, state, attributeNames, onlyListedAttributes) {
  let refinements = getRefinements(results, state);
  const otherAttributeNames = reduce(refinements, (res, refinement) => {
    if (attributeNames.indexOf(refinement.attributeName) === -1 && res.indexOf(refinement.attributeName === -1)) {
      res.push(refinement.attributeName);
    }
    return res;
  }, []);
  refinements = refinements.sort(compareRefinements.bind(null, attributeNames, otherAttributeNames));
  if (onlyListedAttributes && !isEmpty(attributeNames)) {
    refinements = filter(refinements, refinement => attributeNames.indexOf(refinement.attributeName) !== -1);
  }
  return refinements;
}

function clearRefinementFromState(state, refinement) {
  switch (refinement.type) {
  case 'facet':
    return state.removeFacetRefinement(refinement.attributeName, refinement.name);
  case 'disjunctive':
    return state.removeDisjunctiveFacetRefinement(refinement.attributeName, refinement.name);
  case 'hierarchical':
    return state.clearRefinements(refinement.attributeName);
  case 'exclude':
    return state.removeExcludeRefinement(refinement.attributeName, refinement.name);
  case 'numeric':
    return state.removeNumericRefinement(refinement.attributeName, refinement.operator, refinement.numericValue);
  case 'tag':
    return state.removeTagRefinement(refinement.name);
  default:
    throw new Error(`clearRefinement: type ${refinement.type} is not handled`);
  }
}

function clearRefinement(helper, refinement) {
  helper.setState(clearRefinementFromState(helper.state, refinement)).search();
}

export default connectCurrentRefinedValues;