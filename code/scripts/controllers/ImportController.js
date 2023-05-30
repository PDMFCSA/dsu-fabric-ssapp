import MessagesService from "../services/MessagesService.js";
import FailedLogDataSource from "../datasources/Import/FailedLogDataSource.js";
import SuccessLogDataSource from "../datasources/Import/SuccessLogDataSource.js";
import utils from "../utils.js";
import constants from "../constants.js";

const {FwController} = WebCardinal.controllers;

export default class importController extends FwController {

  constructor(...props) {

    super(...props);
    this.filesArray = [];
    const dbAPI = require("opendsu").loadAPI("db");

    this.model = {
      selectedTab: 0,
      filesChooser: {
        label: "Select files",
        accept: ".json",
        listFiles: false,
        filesAppend: true,
        "event-name": constants.HTML_EVENTS.UPLOADPRODUCTS,
        "list-files": false
      },
      importIsDisabled: true,
      retryBtnIsDisabled: true,
      forceRetryBtnIsDisabled: true,
      successfullyImportedLogs: [],
      retryAll: false,
      successDataSource: new SuccessLogDataSource(this.storageService),
      failedDataSource: new FailedLogDataSource(this.storageService),
    };

    this.on(constants.HTML_EVENTS.UPLOADPRODUCTS, (event) => {
      this.filesArray = event.data || [];
      this.model.importIsDisabled = this.filesArray.length === 0;
      if (this.filesArray.length !== 0) {
        this.model.filesChooser.listFiles = true;
        this.model.filesChooser["list-files"] = true;
      }
    });

    let self = this;

    async function digest(messages) {
      await this.predigest(messages);

      let failedMessages = [];
      for (let msg of messages) {
        let promisified = $$.promisify(MessagesService.processMessagesWithoutGrouping);
        let error;
        let undigested;
        try {
          undigested = await promisified([msg], MessagesService.getStorageService(this.storageService));
          for (let failed of undigested) {
            failedMessages.push(failed);
          }
        } catch (err) {
          error = err;
        }

        let handler = this.getHandlerForMessageDigestingProcess(messages, this.prepareModalInformation);
        window.WebCardinal.loader.hidden = true;
        //managing popus ...
        await handler(error, undigested);
      }

      await this.manageProcessedMessages(failedMessages);
      if (failedMessages.length) {
        this.model.retryAll = false;
      }

      this.filesArray = [];
      this.model.importIsDisabled = this.filesArray.length === 0;
      this.model.filesChooser.listFiles = false;
      this.model.filesChooser["list-files"] = false;
    }

    this.onTagClick("import", async () => {
      if (this.filesArray.length === 0 || this.model.importIsDisabled) {
        return;
      }
      this.model.importIsDisabled = true;
      let messages;
      try {
        window.WebCardinal.loader.hidden = false;
        messages = await this.getMessagesFromFiles(this.filesArray);

      } catch (err) {
        this.showErrorModal(`Unable to read selected files.`, "Error");
      }

      await digest.call(self, messages);

    });
    /*
        Removed for MVP1

        this.onTagClick("view-all", async () => {
          const openDSU = require("opendsu");
          const config = openDSU.loadAPI("config");
          const domain = await $$.promisify(config.getEnv)("epiDomain");
          window.disableRefreshSafetyAlert = true;
          window.open(`${window.location.origin}/mappingEngine/${domain}/logs`, '_blank');
        })
    */


    this.onTagClick("prev-page", async (model, target, event) => {
      let dataSource;
      if (target.getAttribute("msgType") === "success") {
        dataSource = this.model.successDataSource;
      } else {
        dataSource = this.model.failedDataSource;
      }
      target.parentElement.querySelector(".next-page-btn").disabled = false;
      await dataSource.goToPreviousPage();
      if (dataSource.getCurrentPageIndex() === 0) {
        target.disabled = true;
      }
      if (this.querySelector("#retry-all-checkbox") && this.querySelector("#retry-all-checkbox").checked) {
        this.querySelector("#retry-all-checkbox").checked = false;
      }
    })

    this.onTagClick("next-page", async (model, target, event) => {
      let dataSource;
      if (target.getAttribute("msgType") === "success") {
        dataSource = this.model.successDataSource;
      } else {
        dataSource = this.model.failedDataSource;
      }
      target.parentElement.querySelector(".prev-page-btn").disabled = false;
      if (dataSource.hasMoreLogs) {
        await dataSource.goToNextPage();
        if (!dataSource.hasMoreLogs) {
          target.parentElement.querySelector(".next-page-btn").disabled = true;
        }
      }
      if (this.querySelector("#retry-all-checkbox") && this.querySelector("#retry-all-checkbox").checked) {
        this.querySelector("#retry-all-checkbox").checked = false;
      }
    })

    let searchInput = this.querySelector("#code-search");
    let foundIcon = this.querySelector(".fa-check");
    let notFoundIcon = this.querySelector(".fa-ban");
    if (searchInput) {
      searchInput.addEventListener(constants.HTML_EVENTS.SEARCH, async (event) => {
        notFoundIcon.style.display = "none";
        foundIcon.style.display = "none";
        if (event.target.value) {
          let results = await $$.promisify(this.storageService.filter)('import-logs', `itemCode == ${event.target.value}`);
          if (results && results.length > 0) {
            foundIcon.style.display = "inline";
            this.model.successDataSource.filterResult = results.filter(item => item.status === "success");
            this.model.failedDataSource.filterResult = results.filter(item => item.status !== "success");
            if (results[0].status === "success") {
              this.model.selectedTab = 0;
            } else {
              this.model.selectedTab = 1;
            }
          } else {
            notFoundIcon.style.display = "inline";
          }
        } else {
          this.model.successDataSource.filterResult = [];
          this.model.failedDataSource.filterResult = [];
        }
        this.model.successDataSource.goToPageByIndex(0);
        this.model.failedDataSource.goToPageByIndex(0);
      })
    }

    this.onTagClick("view-message", async (model, target, event) => {
      let secondMessage;
      this.model.actionModalModel = {
        title: "Message",
        denyButtonText: 'Close',
        acceptButtonText: "Download message"
      }
      let auditDetails = await utils.getLogDetails(model.details);
      //keep compatibility with old log version
      auditDetails = auditDetails.logInfo || auditDetails;
      if (auditDetails.invalidFields) {
        secondMessage = auditDetails.invalidFields;
        this.model.actionModalModel.secondMessageData = secondMessage;
        this.model.actionModalModel.showSecondMessage = true;
        delete auditDetails.invalidFields;
      }

      const formattedJSON = JSON.stringify(auditDetails, null, 4);

      this.model.actionModalModel.messageData = formattedJSON;

      this.showModalFromTemplate('view-message-modal',
        () => {
          let dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(formattedJSON);
          let downloadAnchorNode = document.createElement('a');
          downloadAnchorNode.setAttribute("href", dataStr);
          downloadAnchorNode.setAttribute("download", model.itemType + "_" + model.itemCode + ".json");
          document.body.appendChild(downloadAnchorNode); // required for firefox
          downloadAnchorNode.click();
          downloadAnchorNode.remove();
        }, () => {
          return
        }, {model: this.model});
    })

    this.onTagEvent("retry-all-click", constants.HTML_EVENTS.CHANGE, (model, target, evt) => {
      this.querySelectorAll(".failed-message").forEach((elem) => {
        elem.checked = target.checked;
        elem.value = target.checked;
      });

       this.updateRetryBtnState();

    })

    this.onTagEvent("retry-item-click", constants.HTML_EVENTS.CHANGE, (model, target, evt) => {
      if (!target.checked) {
        document.querySelector("#retry-all-checkbox").checked = target.checked;
      }

      this.updateRetryBtnState();
    })

    async function getSelectedFailed(prepareFnc) {
      let messages = [];
      let failedImportedLogs = Array.from(this.querySelectorAll(".failed-message"))
      for (let elem of failedImportedLogs) {
        if (elem.checked) {
          let itemModel = elem.getDataTagModel();
          let logDetails = await utils.getLogDetails(itemModel.details);
          let message = logDetails.logInfo;
          if (prepareFnc) {
            message = prepareFnc(message);
          }

          messages.push(message);
        }
      }
      return messages;
    }

    function prepareCallback(prepareFnc) {
      return async (model, target, event) => {
        let messages = await getSelectedFailed.call(this, prepareFnc);
        if (messages.length > 0) {
          this.model.selectedTab = 1;
          window.WebCardinal.loader.hidden = false;

          await MessagesService.processMessages(messages, MessagesService.getStorageService(this.storageService), async (undigestedMessages) => {
            await this.manageProcessedMessages(undigestedMessages);
            await this.logUndigestedMessages(undigestedMessages);
          });

          this.model.retryAll = false;

          this.querySelector("#retry-all-checkbox").checked = false;
          this.model.retryBtnIsDisabled = true;
          this.model.forceRetryBtnIsDisabled = true;
        }
      }
    }

    this.onTagClick("retry-failed", async (model, target, event) => {
      let messages = await getSelectedFailed.call(this);
      if (messages.length > 0) {
        this.model.selectedTab = 1;
        window.WebCardinal.loader.hidden = false;

        await digest.call(self, messages);

        this.model.retryAll = false;

        this.querySelector("#retry-all-checkbox").checked = false;
        this.model.retryBtnIsDisabled = true;
        this.model.forceRetryBtnIsDisabled = true;
      }
    });

    this.onTagClick("force-retry-failed", prepareCallback.call(self, (msg) => {
      msg = JSON.parse(JSON.stringify(msg));
      msg.force = true;
      return msg;
    }));

  }

  async predigest(messages){
    let digestLog = await this.buildDigestLog(messages);
    let auditEnclave = await this.getEnclaveBypassingAnyCache();
    let id = await auditEnclave.getUniqueIdAsync();
    let secret = await MessagesService.acquireLock(id, 60000, 100, 500);
    let pk = require("opendsu").loadApi("crypto").generateRandom(32);
    try{
      await auditEnclave.safeBeginBatchAsync();
    } catch(err){
      throw err;
    }

    try{
      await $$.promisify(auditEnclave.insertRecord)(undefined, "logs", pk, digestLog)
      await MessagesService.releaseLock(id, secret)
      await auditEnclave.commitBatchAsync();
    }catch (err) {
      const insertError = createOpenDSUErrorWrapper(`Failed to insert record in enclave`, err);
      try{
        await auditEnclave.cancelBatchAsync();
      }catch (e) {
        console.log(createOpenDSUErrorWrapper(`Failed to cancel batch`, e, insertError));
      }
      alert("There was an error during audit save: "+insertError.message+" "+insertError.stack);
    }
  }

  async getEnclaveBypassingAnyCache(){
    return new Promise(async (resolve, reject)=>{
      try{
        let keySSI = await $$.promisify(this.storageService.getKeySSI, this.storageService)();
        let storageDSU = await $$.promisify(this.storageService.getDSU, this.storageService)();
        storageDSU.marked = true;
        let auditEnclave = require("opendsu").loadApi("enclave").initialiseWalletDBEnclave(keySSI);
        auditEnclave.on("initialised", async ()=>{
          let storageDSU = await $$.promisify(auditEnclave.getDSU, auditEnclave)();
          if(storageDSU.marked){
            return reject(Error('Failed to obtain a clean sharedEnclave instance'));
          }
          resolve(auditEnclave);
        })
      }catch (err){
        reject(err);
      }
    });
  }

  async buildDigestLog(messages){
    let summary = [];
    let log = {reason:`The processing of ${messages.length} message(s) has been initiated.`, logInfo:{summary, messages}};
    // we try to be sure that we capture the username of the current user even if there was a problem and the message array is empty
    let dummyMessage = await utils.ensureMinimalInfoOnMessage({});
    log.username = dummyMessage.senderId;

    for(let index in messages){
      let msg = messages[index];
      let summaryItem = `[${index}] Message type ${msg.messageType} for `;
      let identifiedTarget = false;
      let target = msg.product || msg.batch || msg.videos || msg;
      if(target.productCode){
        summaryItem += `GTIN=${target.productCode} `;
        identifiedTarget = true;
      }
      if(target.batch){
        summaryItem += `Batch=${target.batch} `;
        identifiedTarget = true;
      }

      if(!identifiedTarget){
        summaryItem += "unidentified product/batch (possible wrong message format)";
      }
      summary.push(summaryItem);
    }
    return log;
  }

  prepareModalInformation(err, undigested, messages) {
    return {
      title: 'Import failed',
      content: `There was an error during import process. Cause: ${err.message ? err.message : 'Unknown'}`
    }
  }

  updateRetryBtnState() {
    let failedMessagesElements = Array.from(this.querySelectorAll(".failed-message"));
    let checkedItems = failedMessagesElements.filter((item) => {
      return item.checked
    })

    if (checkedItems.length < failedMessagesElements.length) {
      this.querySelector("#retry-all-checkbox").checked = false;
    } else {
      this.querySelector("#retry-all-checkbox").checked = true;
    }
    this.model.retryBtnIsDisabled = checkedItems.length === 0;
    this.model.forceRetryBtnIsDisabled = checkedItems.length !== 1;
  }

  async getMessagesFromFiles(files) {
    let messages = [];
    let filesRead = 0;

    return new Promise((resolve, reject) => {
      for (let i = 0; i < files.length; i++) {
        let file = files[i];

        let fileReader = new FileReader();
        fileReader.readAsText(file, "UTF-8");

        fileReader.onload = async function (evt) {
          let message;
          try {
            message = JSON.parse(evt.target.result);
          } catch (e) {
            reject(e);
          }
          //TODO discuss if files can contain more than one message/product
          if (Array.isArray(message)) {
            for (let i = 0; i < message.length; i++) {
              messages.push(await utils.ensureMinimalInfoOnMessage(message[i]));
            }
          } else {
            messages.push(await utils.ensureMinimalInfoOnMessage(message));
          }
          filesRead++;
          if (filesRead === files.length) {
            resolve(messages);
          }
        }

        fileReader.onerror = function (evt) {
          throw new Error("Error reading file")
        }
      }
    })
  }

  async manageProcessedMessages(undigestedMessages) {
    window.WebCardinal.loader.hidden = true;
    this.querySelector(".prev-page-btn[msgType='success']").disabled = true;
    this.querySelector(".next-page-btn[msgType='success']").disabled = false;
    this.model.successDataSource.importLogs = [];
    await this.model.successDataSource.goToPageByIndex(0);
    this.querySelector(".prev-page-btn[msgType='failed']").disabled = true;
    this.querySelector(".next-page-btn[msgType='failed']").disabled = false;
    this.model.failedDataSource.importLogs = [];
    await this.model.failedDataSource.goToPageByIndex(0);

    if (undigestedMessages.length === 0) {
      this.model.selectedTab = 0;
    } else {
      this.model.selectedTab = 1;
    }
  }

}

