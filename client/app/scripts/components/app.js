import debug from 'debug';
import React from 'react';
import { connect } from 'react-redux';

import { getApiDetails, getTopologies } from '../utils/web-api-utils';
import { focusSearch, pinNextMetric, hitBackspace, hitEnter, hitEsc, unpinMetric,
  selectMetric, toggleHelp, toggleGridMode } from '../actions/app-actions';
import Nodes from './nodes';
import { getRouter } from '../utils/router-utils';
import { getUrlState } from '../utils/router-utils';
import { getActiveTopologyOptions } from '../utils/topology-utils';

const BACKSPACE_KEY_CODE = 8;
const ENTER_KEY_CODE = 13;
const ESC_KEY_CODE = 27;
const keyPressLog = debug('scope:app-key-press');

class App extends React.Component {

  constructor(props, context) {
    super(props, context);
    this.onKeyPress = this.onKeyPress.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
  }

  componentDidMount() {
    window.addEventListener('keypress', this.onKeyPress);
    window.addEventListener('keyup', this.onKeyUp);

    getRouter(this.props.dispatch, this.props.urlState).start({hashbang: true});
    if (!this.props.routeSet) {
      // dont request topologies when already done via router
      getTopologies(this.props.activeTopologyOptions, this.props.dispatch);
    }
    getApiDetails(this.props.dispatch);
  }

  componentWillUnmount() {
    window.removeEventListener('keypress', this.onKeyPress);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  onKeyUp(ev) {
    const { showingTerminal } = this.props;
    keyPressLog('onKeyUp', 'keyCode', ev.keyCode, ev);

    // don't get esc in onKeyPress
    if (ev.keyCode === ESC_KEY_CODE) {
      this.props.dispatch(hitEsc());
    } else if (ev.keyCode === ENTER_KEY_CODE) {
      this.props.dispatch(hitEnter());
    } else if (ev.keyCode === BACKSPACE_KEY_CODE) {
      this.props.dispatch(hitBackspace());
    } else if (ev.code === 'KeyD' && ev.ctrlKey && !showingTerminal) {
      this.forceUpdate();
    }
  }

  onKeyPress(ev) {
    const { dispatch, searchFocused } = this.props;
    //
    // keyup gives 'key'
    // keypress gives 'char'
    // Distinction is important for international keyboard layouts where there
    // is often a different {key: char} mapping.
    //
    if (!searchFocused) {
      keyPressLog('onKeyPress', 'keyCode', ev.keyCode, ev);
      const char = String.fromCharCode(ev.charCode);
      if (char === '<') {
        dispatch(pinNextMetric(-1));
      } else if (char === '>') {
        dispatch(pinNextMetric(1));
      } else if (char === 't' || char === 'g') {
        dispatch(toggleGridMode());
      } else if (char === 'q') {
        dispatch(unpinMetric());
        dispatch(selectMetric(null));
      } else if (char === '/') {
        ev.preventDefault();
        dispatch(focusSearch());
      } else if (char === '?') {
        dispatch(toggleHelp());
      }
    }
  }

  render() {
    return (
      <div className="app">
        <Nodes />
      </div>
    );
  }
}

function mapStateToProps(state) {
  return {
    activeTopologyOptions: getActiveTopologyOptions(state),
    gridMode: state.get('gridMode'),
    routeSet: state.get('routeSet'),
    searchFocused: state.get('searchFocused'),
    searchQuery: state.get('searchQuery'),
    showingDetails: state.get('nodeDetails').size > 0,
    showingHelp: state.get('showingHelp'),
    showingMetricsSelector: state.get('availableCanvasMetrics').count() > 0,
    showingNetworkSelector: state.get('availableNetworks').count() > 0,
    showingTerminal: state.get('controlPipes').size > 0,
    urlState: getUrlState(state)
  };
}

export default connect(
  mapStateToProps
)(App);
