import { ethers, upgrades } from "hardhat";
import { expect } from "chai";
import { Contract, ContractFactory } from "ethers";
import { BoxV2 } from "../typechain-types";

describe("Box", function () {
  it("works", async () => {
    const Box = await ethers.getContractFactory("Box");
    const BoxV2 = await ethers.getContractFactory("BoxV2");

    const beacon = await upgrades.deployBeacon(Box as any);
    const instance = await upgrades.deployBeaconProxy(beacon, Box as any);
    await instance.store(42);

    await upgrades.upgradeBeacon(beacon, BoxV2 as any);
    const upgraded: BoxV2 = BoxV2.attach(await instance.getAddress());

    const value = await upgraded.retrieve();
    expect(value.toString()).to.equal("42");
  });
});
