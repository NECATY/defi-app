import { call, put, takeLatest, select, delay } from 'redux-saga/effects';
import * as log from '../../utils/electronLogger';
import {
  getSettingOptionsRequest,
  getSettingOptionsSuccess,
  getSettingOptionsFailure,
  getInitialSettingsRequest,
  getInitialSettingsSuccess,
  getInitialSettingsFailure,
  updateSettingsRequest,
  updateSettingsSuccess,
  updateSettingsFailure,
} from './reducer';
import {
  updateSettingsData,
  initialData,
  enablePreLaunchStatus,
  disablePreLaunchStatus,
  getLanguage,
  getAmountUnits,
  getDisplayModes,
  getNetWorkList,
} from './service';
import store from '../../app/rootStore';
import { setupI18n } from '../../translations/i18n';
import { LANG_VARIABLE } from '../../constants';
import PersistentStore from '../../utils/persistentStore';
import { restartNode } from '../../utils/isElectron';
import { restartModal } from '../ErrorModal/reducer';
import { shutDownBinary } from '../../worker/queue';
import {
  MAINNET,
  TESTNET,
  DEFAULT_MAINNET_CONNECT,
  DEFAULT_TESTNET_CONNECT,
  DEFAULT_MAINNET_PORT,
  DEFAULT_TESTNET_PORT,
  BLOCKCHAIN_INFO_CHAIN_MAINNET,
  BLOCKCHAIN_INFO_CHAIN_TEST,
} from '../../constants';

export function* getSettingsOptions() {
  try {
    const languages = yield call(getLanguage);
    const amountUnits = yield call(getAmountUnits);
    const displayModes = yield call(getDisplayModes);
    const networkOptions = yield call(getNetWorkList);
    yield put(
      getSettingOptionsSuccess({
        languages,
        amountUnits,
        displayModes,
        networkOptions,
      })
    );
  } catch (e) {
    yield put(getSettingOptionsFailure(e.message));
    log.error(e);
  }
}

export function* getSettings() {
  const {
    blockChainInfo: { chain },
  } = yield select((state) => state.syncstatus);
  let network = '';
  if (chain === BLOCKCHAIN_INFO_CHAIN_TEST) {
    network = TESTNET;
  }
  if (chain === BLOCKCHAIN_INFO_CHAIN_MAINNET) {
    network = MAINNET;
  }
  try {
    const data = yield call(initialData);
    if (data) {
      yield put({
        type: getInitialSettingsSuccess.type,
        payload: { ...data, network },
      });
    } else {
      yield put({
        type: getInitialSettingsFailure.type,
        payload: 'No data found',
      });
    }
  } catch (e) {
    yield put({ type: getInitialSettingsFailure.type, payload: e.message });
    log.error(e);
  }
}

export function* updateSettings(action) {
  try {
    let updateLanguage = false;
    const {
      appConfig: { network: prevNetwork },
    } = yield select((state) => state.settings);
    if (PersistentStore.get(LANG_VARIABLE) !== action.payload.language) {
      updateLanguage = true;
    }
    const data = yield call(updateSettingsData, action.payload);
    if (data) {
      if (updateLanguage) {
        setupI18n(store);
      }
      if (data.launchAtLogin) {
        enablePreLaunchStatus(data.minimizedAtLaunch);
      } else {
        disablePreLaunchStatus();
      }
      yield put({ type: updateSettingsSuccess.type, payload: { ...data } });
      if (action.payload.network !== prevNetwork) {
        yield call(changeNetworkNode, action.payload.network);
      }
    } else {
      yield put({
        type: updateSettingsFailure.type,
        payload: 'No data found',
      });
    }
  } catch (e) {
    yield put({ type: updateSettingsFailure.type, payload: e.message });
    log.error(e);
  }
}

export function* changeNetworkNode(networkName) {
  const { configurationData } = yield select((state) => state.app);
  const network = {
    regtest: 0,
    testnet: 0,
  };
  let name = 'main';
  const config = {
    rpcbind: DEFAULT_MAINNET_CONNECT,
    rpcport: DEFAULT_MAINNET_PORT,
  };
  if (networkName === TESTNET) {
    network.testnet = 1;
    name = 'test';
    config.rpcbind = DEFAULT_TESTNET_CONNECT;
    config.rpcport = DEFAULT_TESTNET_PORT;
  }
  // if (networkName === REGTEST) {
  //   network.regtest = 1;
  //   name = 'regtest';
  //   config.rpcbind = DEFAULT_MAINNET_CONNECT;
  //   config.rpcport = DEFAULT_MAINNET_PORT;
  // }
  const updatedConf = Object.assign({}, configurationData, network, {
    [name]: config,
  });
  yield put(restartModal());
  yield call(shutDownBinary);
  yield call(restartNode, { updatedConf });
}

function* mySaga() {
  yield takeLatest(getSettingOptionsRequest.type, getSettingsOptions);
  yield takeLatest(getInitialSettingsRequest.type, getSettings);
  yield takeLatest(updateSettingsRequest.type, updateSettings);
}

export default mySaga;
