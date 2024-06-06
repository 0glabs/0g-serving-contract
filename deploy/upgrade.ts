import { ethers, upgrades } from "hardhat";

const beaconAddress = process.env["BEACON_ADDRESS"] || "";
const dataRetrieveAddress = process.env["DATA_RETRIEVE_ADDRESS"] || "";

if (!beaconAddress) {
    throw new Error("BEACON_ADDRESS unset");
}

if (!dataRetrieveAddress) {
    throw new Error("DATA_RETRIEVE_ADDRESS unset");
}

async function main() {
    const DataRetrieveV2 = await ethers.getContractFactory("DataRetrieveV2");
    await upgrades.upgradeBeacon(beaconAddress, DataRetrieveV2);
    await DataRetrieveV2.attach(dataRetrieveAddress);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
