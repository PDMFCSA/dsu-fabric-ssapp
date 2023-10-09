const gtinResolver = require("gtin-resolver");
const LeafletService = gtinResolver.DSUFabricUtils;
const Languages = gtinResolver.Languages
const UploadTypes = gtinResolver.UploadTypes
const {FwController} = WebCardinal.controllers;
const XMLDisplayService = gtinResolver.XMLDisplayService;

import epiUtils from "./epiUtils.js";
import utils from "./../../utils.js"


export default class EpiComponentController extends FwController {

  constructor(...props) {
    super(...props);
    this.model.filesChooser = {
      accept: "directory", uploadedFiles: [], label: "Upload files", "list-files": true
    };

    this.onTagClick("add-language-leaflet", (event) => {
      this.addLanguageTypeFilesListener(event)
    });

    this.model.onChange("modalData.languages.value", () => {
      this.checkIfEpiUpdateWarning()
    });
    this.model.onChange("filesChooser.uploadedFiles", async (event) => {
      this.uploadedFiles = this.model.filesChooser.uploadedFiles || [];
      if (this.uploadedFiles.length > 0) {
        await this.validateLeafletFiles()
      }
    })

    this.onTagClick("delete-language-leaflet", (model, target, event) => {
      let eventData = target.firstElementChild.innerText.split('/');
      let selectedEpiCard = epiUtils.getSelectedEpiCard(this.model.languageTypeCards, eventData[0], eventData[1]);
      selectedEpiCard.action = LeafletService.LEAFLET_CARD_STATUS.DELETE;
      if (selectedEpiCard.videoSource) {
        this.model.videoSourceUpdated = true;
      }
      this.updateCardsForDisplay();
    });

    this.onTagClick("preview-epi", async (epiModel, target, event) => {

      utils.displayLoader();
      let selectedEpi = epiUtils.getSelectedEpiCard(this.model.languageTypeCards, epiModel.language.value, epiModel.type.value);
      let {previewModalTitle, epiData} = await epiUtils.getPreviewModel(this.model, selectedEpi);
      this.model.previewModalTitle = previewModalTitle;
      this.model.epiData = epiData;

      this.showModalFromTemplate("preview-epi/template", () => {
      }, () => {
      }, {disableExpanding: true, disableFooter: true, model: this.model, controller: "modals/PreviewEpiController"});
      utils.hideLoader();

    })
  }

  addLanguageTypeFilesListener(event) {
    let disabledFeatures = this.model.disabledFeatures.map(feature => {
      if (feature === "01") {
        return "leaflet"
      }
      if (feature === "04") {
        return "smpc"
      }
    })
    const languages = {
      label: "Language", placeholder: "Select a language", options: Languages.getListAsVM()
    };
    const types = {
      componentLabel: "Type", placeholder: "Select a type", options: UploadTypes.getListAsVM(disabledFeatures)
    };
    this.model.filesChooser.uploadedFiles = [];
    this.model.modalData = {
      title: "Choose language and type of upload",
      acceptButtonText: 'Accept',
      denyButtonText: 'Cancel',
      languages: languages,
      types: types,
      videoDisabled: this.model.disabledFeatures.find(item => item.trim() === "05"),
      product: {
        language: "en", type: "leaflet", videoSource: ""
      },
      filesWereNotSelected: true,
    }


    this.showModalFromTemplate('select-language-and-type-modal', () => {
      let {selectedType, selectedLanguage} = this.getEpiTypeLang();

      let selectedEpiCardIndex = epiUtils.getSelectedEpiCardIndex(this.model.languageTypeCards, selectedLanguage.value, selectedType.value);

      let videoSource = btoa(this.model.modalData.product.videoSource);
      let card = LeafletService.generateCard("", selectedType.value, selectedLanguage.value, this.uploadedFiles, videoSource);
      this.model.filesChooser.uploadedFiles = [];
      if (selectedEpiCardIndex >= 0) {
        card.action = LeafletService.LEAFLET_CARD_STATUS.UPDATE;
        this.model.languageTypeCards[selectedEpiCardIndex] = card;
      } else {
        card.action = LeafletService.LEAFLET_CARD_STATUS.NEW;
        this.model.languageTypeCards.push(card);
      }
      if (videoSource) {
        this.model.videoSourceUpdated = true;
      }
      this.updateCardsForDisplay();
    }, () => {
      this.model.filesChooser.uploadedFiles = [];
      return
    }, {model: this.model});
  }

  getEpiTypeLang() {
    let selectedType = UploadTypes.getListAsVM().find(type => type.value === this.model.modalData.types.value);
    let selectedLanguage = Languages.getListAsVM().find(lang => lang.value === this.model.modalData.languages.value);
    return {selectedType, selectedLanguage}
  }

  updateCardsForDisplay() {
    this.model.languageTypeCardsForDisplay = this.model.languageTypeCards.filter(card => card.action !== LeafletService.LEAFLET_CARD_STATUS.DELETE)

  }

  checkIfEpiUpdateWarning() {
    let selectedEpi = epiUtils.getSelectedEpiCard(this.model.languageTypeCards, this.model.modalData.languages.value, this.model.modalData.types.value);
    if (selectedEpi && selectedEpi.action && selectedEpi.action !== LeafletService.LEAFLET_CARD_STATUS.DELETE) {
      this.notificationHandler.reportUserRelevantWarning(`You are about to update an existing leaflet`)
    }

  }

  async validateLeafletFiles() {
    try {
      let {selectedType, selectedLanguage} = this.getEpiTypeLang();
      let selectedEpi = {language: selectedLanguage, type: selectedType, files: this.uploadedFiles};
      let {xmlContent, leafletImages} = await epiUtils.getEpiContent(this.model, selectedEpi);

      let xmlService = new XMLDisplayService(this.element);
      let htmlXMLContent = xmlService.getHTMLFromXML("", xmlContent);
      let leafletHtmlContent = xmlService.buildLeafletHTMLSections(htmlXMLContent);
      if (!leafletHtmlContent) {
        throw new Error("Couldn't build HTML from provided files")
      }

      let leafletHtmlImages = htmlXMLContent.querySelectorAll("img");
      let htmlImageNames = Array.from(leafletHtmlImages).map(img => img.getAttribute("src"));
      //removing from validation image src that are data URLs ("data:....")
      htmlImageNames = htmlImageNames.filter((imageSrc)=>{
        let dataUrlRegex = new RegExp(/^\s*data:([a-z]+\/[a-z]+(;[a-z\-]+\=[a-z\-]+)?)?(;base64)?,[a-z0-9\!\$\&\'\,\(\)\*\+\,\;\=\-\.\_\~\:\@\/\?\%\s]*\s*$/i);
        if(!!imageSrc.match(dataUrlRegex) || imageSrc.startsWith("data:")){
          return false;
        }
        return true;
      });
      let uploadedImageNames = Object.keys(leafletImages);
      let differentCaseImgFiles = [];
      let missingImgFiles = []
      htmlImageNames.forEach(imgName => {
        if (!leafletImages[imgName]) {
          let differentCaseImg = uploadedImageNames.find((item) => item.toLowerCase() === imgName.toLowerCase())
          if (differentCaseImg) {
            differentCaseImgFiles.push({xmlName: imgName, fileName: differentCaseImg});
          } else {
            missingImgFiles.push(imgName);
          }
        }
      })

      if (missingImgFiles.length > 0) {
        this.notificationHandler.reportUserRelevantError(this.getToastContent(this.generateMissingToastList(missingImgFiles)));
        this.model.modalData.filesWereNotSelected = true;
        return;
      }
      if (differentCaseImgFiles.length > 0) {
        this.notificationHandler.reportUserRelevantWarning(this.getToastContent(this.generateDifferentCaseToastList(differentCaseImgFiles)));
      }

      this.model.modalData.filesWereNotSelected = this.uploadedFiles.length === 0;

    } catch (e) {
      console.log("EPI files validation fails: ", e);
      this.notificationHandler.reportUserRelevantError("Attention: uploaded files format is not supported. To proceed successfully verify that you have an XML file and your XML file adheres to the prescribed format and structure. To obtain the correct XML specifications we recommend consulting our documentation. Thank you! ");
      this.model.modalData.filesWereNotSelected = true;
    }

  }

  generateMissingToastList(missingImgFiles) {
    let missingFilesErrText = ``;
    missingImgFiles.forEach(item => {
      missingFilesErrText = missingFilesErrText + `<li>Image ${item} does not exist</li>`
    })
    return missingFilesErrText;
  }

  generateDifferentCaseToastList(differentCaseImgFiles) {
    let differentCaseErrText = ``;
    differentCaseImgFiles.forEach(item => {
      differentCaseErrText = differentCaseErrText + `<li>Image ${item.xmlName} does not exist, but a similar file ${item.fileName}  exists and will be used instead</li>`
    })
    return differentCaseErrText;
  }

  getToastContent(htmlList) {
    return `<div class="toast-content"><div>Uploaded XML file contains unknown image reference</div> <br>
            <div> <ul>${htmlList}</ul></div></div>`
  }

}

