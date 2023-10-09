import MessagesService from "../services/MessagesService.js";

const {WebcController} = WebCardinal.controllers;
import {getPermissionsWatcher} from "./../services/PermissionsWatcher.js";

class FwController extends WebcController {
  constructor(...props) {
    super(...props);
    try {
      window.WebCardinal.loader.hidden = true;
    } catch (e) {
      // no loader to hide
    }

    const openDSU = require("opendsu");
    this.notificationHandler = openDSU.loadAPI("error");
    setTimeout(()=>{
        this.initPermissionsWatcher();
    }, 0);
  }

  initPermissionsWatcher(){
    getPermissionsWatcher();
  }

  getHandlerForMessageDigestingProcess(messages, prepareModalInformation) {
    return (err, undigested) => {

      return new Promise(async (resolve) => {
        if (err) {
          const modal = prepareModalInformation(err, undigested, messages);
          this.showErrorModal(new Error(modal.content),
            modal.title,
            () => {
              setTimeout(async () => {
                await this.logUndigestedMessages(undigested);
                this.hideModal();
                resolve();
              }, 100);
            },
            () => {
              this.hideModal();
              resolve();
            },
            {
              disableExpanding: true,
              disableCancelButton: true,
              confirmButtonText: 'Ok',
              id: 'first-feedback-modal'
            });
          return;
        }

        await this.logUndigestedMessages(undigested);
        if (this.saveErrModal) {
          this.saveErrModal.destroy()
        }
        resolve();
        return;

      });
    }
  }

  prepareModalInformation(err, undigested, initialMessages) {
    console.log("This method needs to be impl by each controller");
    return {
      title: "No title",
      content: "No content"
    }
  }

  async logUndigestedMessages(undigested) {
    try {
      await $$.promisify(MessagesService.logFailedMessages)(undigested, this.storageService);
    } catch (err) {
      window.WebCardinal.loader.hidden = true;
      this.saveErrModal = this.showErrorModal(
        new Error(`Unable to save failed messages. Cause: ${err.message ? err.message : ''}`),
        'Log operation status',
        () => {
        },
        () => {
        },
        {
          disableExpanding: true,
          disableCancelButton: true,
          confirmButtonText: 'Ok',
          id: 'failed-to-log-modal'
        });
    }
  }

  showProgressModal(model, controller) {
    let defaultModel = {
      title: "Please wait...",
      steps: 1,
      currentStep: 1,
      updateProgressInfo: function (currentStep, steps) {
        return `Processing step ${currentStep} of ${steps}`
      }
    }
    Object.assign(defaultModel, model);
    defaultModel.progressText = defaultModel.updateProgressInfo(defaultModel.currentStep, defaultModel.steps);
    let progressLoaderModal = this.createWebcModal({
      template: "progress-loader/template",
      disableExpanding: true,
      disableFooter: true,
      disableClosing: true,
      model: defaultModel,
      controller: controller || "modals/ProgressLoaderController"
    });
    progressLoaderModal.show();

    return {
      updateCurrentStep: function (stepDelta = 1) {
        progressLoaderModal.model.currentStep += stepDelta;
      },
      hide: function () {
        progressLoaderModal.destroy();
      }
    }
  }

  navigateToPageTag(tag, state) {
    let trigger = ()=>{
      this.element.dispatchEvent(
        new CustomEvent('webcardinal:tags:get', {
          bubbles: true,
          composed: true,
          cancelable: true,
          detail: {
            tag,
            callback: (error, path) => {
              if (error) {
                console.error(error);
                return;
              }
              if (typeof path === 'object') {
                console.warn(`Tag "${tag}" can not be found in all the available routes`, path)
                return;
              }

              this.navigateToUrl(path, state);
            },
          },
        }),
      );
    }

    if($$.uiProgressService && $$.uiProgressService.popupActive()){
      return setTimeout(()=>{
        this.navigateToPageTag(tag, state);
      }, 1000);
    }

    trigger();
  }

}

export {FwController};
