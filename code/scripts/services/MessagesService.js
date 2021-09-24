const mappings = require("epi-utils").loadApi("mappings");
const MessagesPipe = require("epi-utils").getMessagesPipe();

async function processMessages(messages, dsuStorage, callback) {
  if (!messages || messages.length === 0) {
    return;
  }
  const LogService = require("epi-utils").loadApi("services").LogService
  let logService = new LogService(dsuStorage);
  const scAPI = require("opendsu").loadAPI("sc");
  const domain = await $$.promisify(scAPI.getVaultDomain)();
  const subdomain = await $$.promisify(scAPI.getSubdomain)();
  const mainDSU = await $$.promisify(scAPI.getMainDSU)();
  await $$.promisify(mainDSU.refresh)()
  let mappingEngine;
  try {
    const holderInfo = {
      domain,
      subdomain
    }
    mappingEngine = mappings.getEPIMappingEngine(dsuStorage, {
      holderInfo: holderInfo,
      logService: logService
    });
  } catch (e) {
    throw e;
  }

  return new Promise(function (resolve, reject) {
    try {

      const MessageQueuingService = require("epi-utils").loadApi("services").getMessageQueuingServiceInstance();
      let messagesPipe = new MessagesPipe(30, 2 * 1000, MessageQueuingService.getNextMessagesBlock);
      let digestedMessagesCounter = 0;
      let undigestedMessages = [];
      messagesPipe.onNewGroup(async (groupMessages) => {
        undigestedMessages = [...undigestedMessages, ...await mappingEngine.digestMessages(groupMessages)];
        digestedMessagesCounter += groupMessages.length;
        if (digestedMessagesCounter >= messages.length) {
          console.log("undigested messages ", undigestedMessages);
          resolve(callback(undigestedMessages));
        }
      })

      messagesPipe.addInQueue(messages);

    } catch (err) {
      console.log("Error on digestMessages", err);
      reject(err)
    }
  });
}

export default {
  processMessages
}
