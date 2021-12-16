import {getCommunicationService} from "../services/CommunicationService.js";

const { WebcController } = WebCardinal.controllers;
import getSharedStorage from "../services/SharedDBStorageService.js";
import constants from "../constants.js";
import utils from "../utils.js";

export default class batchesController extends WebcController {
  constructor(element, history) {
    super(element, history);
    this.model = {};
    this.model.batches = [];
    this.storageService = getSharedStorage(this.DSUStorage);
    getCommunicationService(this.DSUStorage).waitForMessage(() => {});

    const openDSU = require("opendsu");
    const scAPI = openDSU.loadAPI("sc");
    scAPI.getMainDSU(async (err, mainDSU) => {
      if (err) {
        return console.log(err);
      }

      await $$.promisify(mainDSU.refresh)();
      await $$.promisify(this.storageService.refresh.bind(this.storageService))();
      const batches = await $$.promisify(
        this.storageService.filter.bind(this.storageService)
      )(constants.BATCHES_STORAGE_TABLE);
      batches.forEach((batch) => {
        batch.code = utils.sanitizeCode(
          this.generateSerializationForBatch(batch, batch.defaultSerialNumber)
        );
        if (batch.defaultRecalledSerialNumber) {
          batch.recalledCode = utils.sanitizeCode(
            this.generateSerializationForBatch(
              batch,
              batch.defaultRecalledSerialNumber
            )
          );
        }
        if (batch.defaultDecommissionedSerialNumber) {
          batch.decommissionedCode = utils.sanitizeCode(
            this.generateSerializationForBatch(
              batch,
              batch.defaultDecommissionedSerialNumber
            )
          );
        }
        let wrongBatch = JSON.parse(JSON.stringify(batch));
        wrongBatch.defaultSerialNumber = "WRONG";
        batch.wrongCode = utils.sanitizeCode(
          this.generateSerializationForBatch(
            wrongBatch,
            wrongBatch.defaultSerialNumber
          )
        );
        batch.formatedDate = batch.expiry.match(/.{1,2}/g).join("/");
        this.model.batches.push(batch);
      });
    });

    this.onTagClick("sort-data", (model, target, event) => {
      let activeSortButtons = this.element.querySelectorAll(
        ".sort-button.active"
      );

      if (activeSortButtons.length > 0) {
        activeSortButtons.forEach((elem) => {
          if (elem !== target) elem.classList.remove("active");
        });
      }
      target.classList.add("active");
      let sortCriteria = JSON.parse(target.getAttribute("event-data"));
      this.model.productsForDisplay.sort(
        utils.sortByProperty(sortCriteria.property, sortCriteria.direction)
      );
    });

    this.onTagClick("view-2DMatrix", (model, target, event) => {
      let eventData = JSON.parse(target.firstElementChild.innerText);
      this.model.actionModalModel = {
        title: "2DMatrix",
        batchData: eventData,
        acceptButtonText: "Close",
      };

      this.showModalFromTemplate(
        "modal2DMatrix",
        () => {
          return;
        },
        () => {
          return;
        },
        { model: this.model }
      );
    });
    this.onTagClick("import-batch", (model, target, event) => {
      event.stopImmediatePropagation();
      this.navigateToPageTag("import");
    });
    this.onTagClick("add-batch", () => {
      this.navigateToPageTag("add-batch");
    });

    this.onTagClick(
      "edit-batch",
      (model, target, event) => {
        let eventData = target.getAttribute("event-data");
        const batchData = this.model.batches.find(
          (element) => element.batchNumber === eventData
        );
        this.navigateToPageTag("add-batch", {
          batchData: JSON.stringify(batchData),
        });
      },
      { capture: true }
    );
  }

  generateSerializationForBatch(batch, serialNumber) {
    if (serialNumber === "" || typeof serialNumber === "undefined") {
      return `(01)${batch.gtin}(10)${batch.batchNumber}(17)${batch.expiry}`;
    }

    return `(01)${batch.gtin}(21)${serialNumber}(10)${batch.batchNumber}(17)${batch.expiry}`;
  }
}
