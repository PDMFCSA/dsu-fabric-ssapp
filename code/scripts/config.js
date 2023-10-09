import utils from "./utils.js";
import constants from "./constants.js";
import getSharedStorage from "./services/SharedDBStorageService.js";
import MessagesService from "./services/MessagesService.js";

import WebcAccordion from "../components/web-components/accordion/webc-accordion.js";
import WebcAccordionItem from "../components/web-components/accordion/webc-accordion-item.js";
import WebcTabNavigator from "../components/web-components/tab-navigator/webc-tab-panel.js";
import WebcDateInput from "../components/web-components/date-input/webc-date-input.js";

const openDSU = require("opendsu");
const {define} = WebCardinal.components;
const {setConfig, getConfig, addHook, addControllers, navigateToPageTag} = WebCardinal.preload;
const {FwController} = await import("./controllers/FwController.js");
const {getInstance} = await import("./services/UIProgressService.js");

async function watchAndHandleExecution(fnc) {
  try {
    await fnc();
  } catch (err) {
    if (err.rootCause === "security") {
      return navigateToPageTag("landing-page");
    }
    if (window.confirm("Looks that your application is not properly initialized or in an invalid state. Would you like to reset it?")) {
      try {
        const response = await fetch("/removeSSOSecret/DSU_Fabric", {
          method: "DELETE",
          cache: "no-cache"
        })
        if (response.ok) {
          const basePath = window.location.href.split("loader")[0];
          $$.forceRedirect(basePath + "loader/newWallet.html");
        } else {
          let er = new Error(`Reset request failed (${response.status})`);
          er.rootCause = `statusCode: ${response.status}`;
          throw er;
        }
      } catch (err) {
        $$.showErrorAlert(`Failed to reset the application. RootCause: ${err.message}`);
        $$.forceTabRefresh();
      }
    } else {
      $$.showErrorAlert(`Application is an undesired state! It is a good idea to close all browser windows and try again!`);
      $$.forceTabRefresh();
    }
  }
  return true;
}

async function initializeWebCardinalConfig() {

  const config = getConfig();
  let userDetails;

  await watchAndHandleExecution(async () => {
    userDetails = await utils.getUserDetails();
  });

  config.identity = {
    avatar: "assets/images/user.png"
  }

  if (userDetails) {
    config.identity.name = userDetails.username;
    config.identity.email = userDetails.company;
  }

  return config;
}

let config = await initializeWebCardinalConfig();

async function setupGlobalErrorHandlers() {
  let errHandler = openDSU.loadAPI("error");

  errHandler.observeUserRelevantMessages(constants.NOTIFICATION_TYPES.WARN, (notification) => {
    utils.renderToast(notification.message, constants.NOTIFICATION_TYPES.WARN)
  });

  errHandler.observeUserRelevantMessages(constants.NOTIFICATION_TYPES.INFO, (notification) => {
    utils.renderToast(notification.message, constants.NOTIFICATION_TYPES.INFO)
  });

  errHandler.observeUserRelevantMessages(constants.NOTIFICATION_TYPES.ERROR, (notification) => {
    let errMsg = "";
    if (notification.err && notification.err.message) {
      errMsg = notification.err.message;
    }
    let toastMsg = `${notification.message} ${errMsg}`
    utils.renderToast(toastMsg, constants.NOTIFICATION_TYPES.ERROR)

  });
}

function finishInit() {
  setConfig(config);

  addHook(constants.HOOKS.BEFORE_PAGE_LOADS, 'generate-did', () => {
    WebCardinal.root.disableHeader = true;
  });

  addHook(constants.HOOKS.WHEN_PAGE_CLOSE, 'generate-did', () => {
    WebCardinal.root.disableHeader = false;
  });

  addHook(constants.HOOKS.BEFORE_PAGE_LOADS, 'landing-page', () => {
    WebCardinal.root.disableHeader = true;
  });


  addHook(constants.HOOKS.BEFORE_APP_LOADS, async () => {

    // load fabric base Controller
    addControllers({FwController});
    await setupGlobalErrorHandlers();

  });

  addHook(constants.HOOKS.AFTER_APP_LOADS, async () => {
    if(!$$.uiProgressService){
      $$.uiProgressService = getInstance();
    }
  });


  addHook(constants.HOOKS.BEFORE_PAGE_LOADS, "home", async () => {
    const gtinResolver = require("gtin-resolver");
    const openDSU = require("opendsu");
    const scAPI = openDSU.loadAPI("sc");
    const w3cdid = openDSU.loadAPI("w3cdid");
    const LogService = gtinResolver.loadApi("services").LogService;

    await watchAndHandleExecution(async () => {
      let userRights = await utils.getUserRights();
      FwController.prototype.userRights = userRights;
      FwController.prototype.canWrite = () => {
        return userRights === constants.USER_RIGHTS.WRITE;
      };
    });

    let userGroupName = "-";

    try {
      let storageService = await $$.promisify(getSharedStorage)();
      FwController.prototype.storageService = storageService;

      const mainEnclave = await $$.promisify(scAPI.getMainEnclave)();
      let did = await scAPI.getMainDIDAsync();

      let loginData = {
        userId: config.identity.name,
        action: "Access wallet",
        userDID: did,
        userGroup: window.currentGroup,
        actionDate: new Date().toISOString()
      }

      let logService = new LogService(constants.LOGIN_LOGS_TABLE);
      if (!window.loggedIn) {

        setTimeout(async ()=>{
          let ID = await storageService.getUniqueIdAsync();
          let lock = await MessagesService.acquireLock(ID, 60000, 100, 500);
          logService.loginLog(loginData, async (err, result) => {
            if (err) {
              console.log("Failed to audit wallet access:", err);
            }
            await MessagesService.releaseLock(ID, lock);
          });
        }, 0);

        const didDomain = await $$.promisify(scAPI.getDIDDomain)();
        const groupDIDDocument = await $$.promisify(w3cdid.resolveDID)(`did:ssi:group:${didDomain}:ePI_Administration_Group`);
        let adminUserList;

        try {
          adminUserList = await $$.promisify(groupDIDDocument.listMembersByIdentity)();
          const memberDID_Document = await $$.promisify(w3cdid.resolveDID)(did);
          loginData.messageType = constants.MESSAGE_TYPES.USER_LOGIN;
          const crypto = require("opendsu").loadAPI("crypto");
          loginData.messageId = crypto.encodeBase58(crypto.generateRandom(32));
          for (let i = 0; i < adminUserList.length; i++) {
            let adminDID_Document = await $$.promisify(w3cdid.resolveDID)(adminUserList[i]);
            await $$.promisify(memberDID_Document.sendMessage)(JSON.stringify(loginData), adminDID_Document);
          }
        } catch (e) {
          console.log("Error sending login message to admins: ", e);
        }

        window.loggedIn = true;
      }
    } catch (e) {
      console.log("Could not initialise properly", e);
      $$.showErrorAlert("Could not initialise the app properly. It is a good idea to close all browser windows and try again!");
    }

    try {
      let disabledFeatures = await gtinResolver.DSUFabricFeatureManager.getDisabledFeatures();
      FwController.prototype.disabledFeatures = disabledFeatures;
    } catch (e) {
      console.log("Could not initialise properly FwController", e);
      $$.showErrorAlert("Could not initialise the app properly. It is a good idea to close all browser windows and try again!");
    }
    WebCardinal.root.disableHeader = false;
  });

  define('epi-card', 'epi-card/template');
  define('page-template', {shadow: true});
  define('df-upload-file', 'upload-file/template');
  define('df-select-dropdown', 'select-dropdown/template');
  define('df-barcode-generator', 'barcode-generator/template');

// components form external library
  customElements.define("df-date-input", WebcDateInput);
  customElements.define("df-accordion-item", WebcAccordionItem);
  customElements.define("df-accordion", WebcAccordion);
  customElements.define("df-tab-panel", WebcTabNavigator);

}

if (config.identity.name) {
  //we finish the init only if proper user details retrieval was executed
  finishInit();
}
