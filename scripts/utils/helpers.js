const fs = require("fs");
const path = require("path");

async function sendTxn(txnPromise, label) {
  const txn = await txnPromise;
  console.info(`Sending ${label}...`);
  await txn.wait();
  console.info("... Sent!");
  return txn;
}

async function deployContract(name, args, label) {
  let info = name;
  if (label) {
    info = name + ":" + label;
  }
  let contractFactory;
  if (name == "Presale") {
    contractFactory = await ethers.getContractFactory(name, {
      libraries: {
        TransferHelper: "0xD918204388F7a1892366CfE8DE4483C62227d06e",
      },
    });
  } else {
    contractFactory = await ethers.getContractFactory(name);
  }
  const contract = await contractFactory.deploy(...args);
  const argStr = args.map((i) => `"${i}"`).join(" ");
  console.info(`Deploying ${info} ${contract.address} ${argStr}`);
  await contract.deployTransaction.wait();
  console.info("... Completed!");
  return contract;
}

async function contractAt(name, address) {
  const contractFactory = await ethers.getContractFactory(name);
  return await contractFactory.attach(address);
}

const tmpAddressesFilepath = path.join(
  __dirname,
  "..",
  "..",
  `.tmp-addresses-${process.env.HARDHAT_NETWORK}.json`
);
const harmonyAddressesFilepath = path.join(
  __dirname,
  "..",
  "..",
  `.harmony-temp-addresses-${process.env.HARDHAT_NETWORK}.json`
);
function readTmpAddresses() {
  if (fs.existsSync(tmpAddressesFilepath)) {
    return JSON.parse(fs.readFileSync(tmpAddressesFilepath));
  }
  return {};
}

function writeTmpAddresses(json) {
  const tmpAddresses = Object.assign(readTmpAddresses(), json);
  fs.writeFileSync(tmpAddressesFilepath, JSON.stringify(tmpAddresses));
}

function writeTmpAddressesByHarmony(json) {
  const tmpAddresses = Object.assign(readTmpAddresses(), json);
  fs.writeFileSync(harmonyAddressesFilepath, JSON.stringify(tmpAddresses));
}

function readTmpAddressesByHarmony() {
  if (fs.existsSync(harmonyAddressesFilepath)) {
    return JSON.parse(fs.readFileSync(harmonyAddressesFilepath));
  }
  return {};
}

module.exports = {
  sendTxn,
  deployContract,
  contractAt,
  writeTmpAddresses,
  writeTmpAddressesByHarmony,
  readTmpAddresses,
  readTmpAddressesByHarmony,
};
