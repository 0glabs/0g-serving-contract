import { ethers } from "hardhat";
import { assert, expect } from "chai";
import { DataRetrieve, DataRetrieve__factory } from "../typechain-types";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import {
  Block,
  ContractTransactionResponse,
  TransactionReceipt,
  randomBytes,
} from "ethers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { beforeEach } from "mocha";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import {
  RequestStruct,
  RequestTraceStruct,
} from "../typechain-types/contracts/DataRetrieve";

describe("DataRetrieve", () => {
  let DataRetrieve: DataRetrieve__factory, dataRetrieve: DataRetrieve;
  let owner: HardhatEthersSigner,
    user1: HardhatEthersSigner,
    provider1: HardhatEthersSigner,
    provider2: HardhatEthersSigner;
  let ownerAddress: string,
    user1Address: string,
    provider1Address: string,
    provider2Address: string;
  let provider1createdAt: number;

  const ownerInitialBalance = 1000;
  const user1InitialBalance = 2000;
  const LOCK_TIME = 24 * 60 * 60;

  const provider1ServiceType = randomBytes(32);
  const provider1Price = 100;
  const provider1Url = "https://example-1.com";

  const provider2ServiceType = randomBytes(32);
  const provider2Price = 100;
  const provider2Url = "https://example-2.com";

  beforeEach(async () => {
    [owner, user1, provider1, provider2] = await ethers.getSigners();
    DataRetrieve = await ethers.getContractFactory("DataRetrieve");
  });

  beforeEach(async () => {
    dataRetrieve = await DataRetrieve.deploy();

    [ownerAddress, user1Address, provider1Address, provider2Address] =
      await Promise.all([
        owner.getAddress(),
        user1.getAddress(),
        provider1.getAddress(),
        provider2.getAddress(),
      ]);

    const initializations: ContractTransactionResponse[] = await Promise.all([
      dataRetrieve.depositFund({ value: ownerInitialBalance }),
      dataRetrieve.connect(user1).depositFund({ value: user1InitialBalance }),
      dataRetrieve
        .connect(provider1)
        .addOrUpdateService(provider1ServiceType, provider1Price, provider1Url),
      dataRetrieve
        .connect(provider2)
        .addOrUpdateService(provider2ServiceType, provider2Price, provider2Url),
    ]);

    const receipt = await initializations[2].wait();
    const block = await ethers.provider.getBlock(
      (receipt as TransactionReceipt).blockNumber
    );
    provider1createdAt = (block as Block).timestamp;
  });

  describe("User", () => {
    it("should deposit fund and update balance", async () => {
      const depositAmount = 1000;
      await dataRetrieve.depositFund({ value: depositAmount });

      const updatedBalance = await dataRetrieve.getUserBalance(ownerAddress);
      assert.equal(updatedBalance, BigInt(ownerInitialBalance + depositAmount));
    });

    it("should get all users", async () => {
      const [addresses, balances] = await dataRetrieve.getAllUsers();

      expect(addresses).to.deep.equal([ownerAddress, user1Address]);
      expect(balances).to.deep.equal([
        ownerInitialBalance,
        user1InitialBalance,
      ]);
    });
  });

  describe("Process refund", () => {
    let unlockTime: number, refundIndex: bigint;
    const refundAmount = 500;

    beforeEach(async () => {
      const res = await dataRetrieve.requestRefund(refundAmount);
      const receipt = await res.wait();
      const block = await ethers.provider.getBlock(
        (receipt as TransactionReceipt).blockNumber
      );
      unlockTime = (block as Block).timestamp + LOCK_TIME;
      refundIndex = (
        await dataRetrieve.queryFilter(dataRetrieve.filters.RefundRequested, -1)
      )[0].args[1];
    });

    it("Should revert if called too soon", async () => {
      await expect(dataRetrieve.processRefund(refundIndex)).to.be.reverted;
    });

    it("Shouldn't fail if the unlockTime has arrived and called", async () => {
      await time.increaseTo(unlockTime);

      await expect(dataRetrieve.processRefund(refundIndex)).not.to.be.reverted;
      const finalBalance = await dataRetrieve.getUserBalance(ownerAddress);
      assert.equal(finalBalance, BigInt(ownerInitialBalance - refundAmount));
    });
  });

  describe("Service provider", () => {
    it("should get service", async () => {
      const [retrievedPrice, retrievedUrl, updatedAt] =
        await dataRetrieve.getService(provider1Address, provider1ServiceType);

      expect(retrievedPrice).to.equal(provider1Price);
      expect(retrievedUrl).to.equal(provider1Url);
      expect(updatedAt).to.not.equal(0);
    });

    it("should get all services", async () => {
      const [addresses, prices, urls, serviceTypes, updatedAts] =
        await dataRetrieve.getAllServices();

      expect(addresses).to.deep.equal([provider1Address, provider2Address]);
      expect(prices).to.deep.equal([provider1Price, provider2Price]);
      expect(urls).to.deep.equal([provider1Url, provider2Url]);
      expect(serviceTypes).to.deep.equal([
        "0x" + Buffer.from(provider1ServiceType).toString("hex"),
        "0x" + Buffer.from(provider2ServiceType).toString("hex"),
      ]);
      expect(updatedAts[0]).to.not.equal(0);
      expect(updatedAts[1]).to.not.equal(0);
    });

    it("should update service", async () => {
      const modifiedPrice = 200;
      const modifiedPriceUrl = "https://example-modified.com";

      await expect(
        dataRetrieve
          .connect(provider1)
          .addOrUpdateService(
            provider1ServiceType,
            modifiedPrice,
            modifiedPriceUrl
          )
      )
        .to.emit(dataRetrieve, "ServiceUpdated")
        .withArgs(
          provider1Address,
          "0x" + Buffer.from(provider1ServiceType).toString("hex"),
          modifiedPrice,
          modifiedPriceUrl,
          anyValue
        );

      const [retrievedPrice, retrievedUrl, updatedAt] =
        await dataRetrieve.getService(provider1Address, provider1ServiceType);

      expect(retrievedPrice).to.equal(modifiedPrice);
      expect(retrievedUrl).to.equal(modifiedPriceUrl);
      expect(updatedAt).to.not.equal(0);
    });

    it("should remove service correctly", async function () {
      await expect(
        dataRetrieve.connect(provider1).removeService(provider1ServiceType)
      )
        .to.emit(dataRetrieve, "ServiceRemoved")
        .withArgs(
          provider1Address,
          "0x" + Buffer.from(provider1ServiceType).toString("hex")
        );

      const [addresses] = await dataRetrieve.getAllServices();
      expect(addresses.length).to.equal(1);
    });
  });

  describe("Settle fees", () => {
    let requestTrace: RequestTraceStruct[];
    let requestCreatedAt: number;
    const requestLength = 3;

    beforeEach(async () => {
      requestCreatedAt = provider1createdAt + 1;
      const requestsFromOwner = await Promise.all(
        Array.from({ length: requestLength }, () =>
          getSignedRequest(
            owner,
            ownerAddress,
            provider1Address,
            provider1ServiceType,
            requestCreatedAt
          )
        )
      );

      const requestsFromUser1 = await Promise.all(
        Array.from({ length: requestLength }, () =>
          getSignedRequest(
            user1,
            user1Address,
            provider1Address,
            provider1ServiceType,
            requestCreatedAt
          )
        )
      );

      requestTrace = [
        { requests: requestsFromOwner },
        { requests: requestsFromUser1 },
      ];
    });

    it("should succeed", async () => {
      await expect(dataRetrieve.connect(provider1).settleFees(requestTrace))
        .to.emit(dataRetrieve, "BalanceUpdated")
        .withArgs(
          ownerAddress,
          ownerInitialBalance - requestLength * provider1Price
        )
        .and.to.emit(dataRetrieve, "BalanceUpdated")
        .withArgs(
          user1Address,
          user1InitialBalance - requestLength * provider1Price
        );
    });

    it("should failed due to double spending", async () => {
      requestTrace[0].requests[1].nonce = requestTrace[0].requests[0].nonce;
      expect(dataRetrieve.connect(provider1).settleFees(requestTrace)).to.be
        .reverted;
    });

    // it("should failed due to invalid recovered signature", async () => {});

    // it("should failed due to changes in the service after the request was made", async () => {});

    // it("should failed due to insufficient balance", async () => {});
  });
});

async function getSignedRequest(
  signer: HardhatEthersSigner,
  user: string,
  provider: string,
  serviceType: Uint8Array,
  createAt: number
): Promise<RequestStruct> {
  const nonce = Math.floor(Math.random() * 1000);
  const hash = ethers.solidityPackedKeccak256(
    ["address", "address", "bytes32", "uint256", "uint256"],
    [provider, user, serviceType, nonce, createAt]
  );

  const sig = await signer.signMessage(ethers.toBeArray(hash));

  return {
    userAddress: user,
    nonce: nonce,
    serviceType: serviceType,
    createdAt: createAt,
    signature: sig,
  };
}
