// SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "../utils/Initializable.sol";
import "../inference/Account.sol";

struct Ledger {
    address user;
    uint availableBalance;
    uint lockedBalance;
}

interface IInference {
    function addAccount(
        address user,
        address provider,
        uint[2] calldata signer,
        uint amount,
        string memory additionalInfo
    ) external payable;

    function depositFund(address user, address provider, uint amount) external payable;

    function requestRefund(address provider, uint amount) external;

    function processRefund(address provider, uint[] calldata indices) external;
}

interface IFineTuning {
    function addAccount(
        address user,
        address provider,
        uint[2] calldata signer,
        uint amount,
        string memory additionalInfo
    ) external payable;

    function depositFund(address user, address provider, uint amount) external payable;

    function requestRefund(address provider, uint amount) external;

    function processRefund(address provider, uint[] calldata indices) external;
}

contract LedgerManager is Ownable, Initializable {
    using EnumerableSet for EnumerableSet.Bytes32Set;

    address public inferenceAddress;
    address public fineTuningAddress;

    error LedgerNotExists(address user);
    error LedgerExists(address user);
    error InsufficientBalance(address user);

    struct LedgerMap {
        EnumerableSet.Bytes32Set _keys;
        mapping(bytes32 => Ledger) _values;
    }

    function initialize(
        uint _locktime,
        address _inferenceAddress,
        address _fineTuningAddress,
        address owner
    ) public onlyInitializeOnce {
        _transferOwnership(owner);
        inferenceAddress = _inferenceAddress;
        fineTuningAddress = _fineTuningAddress;

        batchVerifier = IBatchVerifier(batchVerifierAddress);
    }

    function getLedger(LedgerMap storage map, address user) internal view returns (Ledger storage) {
        return _get(map, user);
    }

    function getAllLedgers(LedgerMap storage map) internal view returns (Ledger[] memory accounts) {
        uint len = _length(map);
        accounts = new Ledger[](len);

        for (uint i = 0; i < len; i++) {
            accounts[i] = _at(map, i);
        }
    }

    function addLedger(LedgerMap storage map, address user, uint amount) internal returns (uint, uint) {
        bytes32 key = _key(user);
        if (_contains(map, key)) {
            revert LedgerExists(user);
        }
        _set(map, key, user, amount);
        return (amount, 0);
    }

    function deleteLedger(LedgerMap storage map, address user) internal {
        bytes32 key = _key(user);
        if (!_contains(map, key)) {
            revert LedgerNotExists(user);
        }
        map._keys.remove(key);
        delete map._values[key];
    }

    function depositFund(LedgerMap storage map, address user, uint amount) internal {
        bytes32 key = _key(user);
        if (!_contains(map, key)) {
            revert LedgerNotExists(user);
        }
        Ledger storage account = _get(map, user);
        account.availableBalance += amount;
    }

    function refund(LedgerMap storage map, address user, uint amount) internal {
        Ledger storage account = _get(map, user);
        if (account.availableBalance < amount) {
            revert InsufficientBalance(user);
        }

        account.availableBalance -= amount;
        payable(msg.sender).transfer(amount);
    }

    function _at(LedgerMap storage map, uint index) internal view returns (Ledger storage) {
        bytes32 key = map._keys.at(index);
        return map._values[key];
    }

    function _contains(LedgerMap storage map, bytes32 key) internal view returns (bool) {
        return map._keys.contains(key);
    }

    function _length(LedgerMap storage map) internal view returns (uint) {
        return map._keys.length();
    }

    function _get(LedgerMap storage map, address user) internal view returns (Ledger storage) {
        bytes32 key = _key(user);
        Ledger storage value = map._values[key];
        if (!_contains(map, key)) {
            revert LedgerNotExists(user);
        }
        return value;
    }

    function _set(LedgerMap storage map, bytes32 key, address user, uint balance) internal {
        Ledger storage account = map._values[key];
        account.availableBalance = balance;
        account.user = user;
        map._keys.add(key);
    }

    function _key(address user) internal pure returns (bytes32) {
        return keccak256(abi.encode(user));
    }
}
