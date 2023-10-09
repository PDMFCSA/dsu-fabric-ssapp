function UIProgressService(){
  let requestsCounter = 0;
  let screen;
  const {WebcController} = WebCardinal.controllers;
  const ctrl = new WebcController(document.body, WebCardinal.history, {}, {});

  let showProgress = (text)=>{
    if(!screen){
      screen = ctrl.createWebcModal({
        disableExpanding: true,
        disableClosing: true,
        disableFooter: true,
        modalTitle: "Info",
        modalContent: text
      });
    }
  }

  let closeProgress = ()=>{
    if(!screen){
      return;
    }
    screen.hide();
    screen = undefined;
  }

  this.showProgress = (text)=>{
    requestsCounter++;
    showProgress(text);
  };

  this.closeProgress = ()=>{
    requestsCounter--;
    if(requestsCounter){
      return;
    }
    closeProgress();
  }

  this.popupActive = () => {
    return !!screen;
  }
}

let instance;
export function getInstance(){
  if(!instance){
    instance = new UIProgressService();
  }
  return instance;
}