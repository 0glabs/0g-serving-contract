// SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./BaseLedger.sol";

struct InferenceLedgerExtra {
    string additionalInfo;
    uint[2] customerSigner;
}

struct InferenceLedger {
    BaseLedger base;
    InferenceLedgerExtra extra;
}

struct InferenceLedgerExtraMap {
    EnumerableSet.Bytes32Set _keys;
    mapping(bytes32 => InferenceLedgerExtra) _values;
}

struct InferenceLedgerMap {
    BaseLedgerMap baseMap;
    InferenceLedgerExtraMap extraMap;
}

library InferenceLedgerLibrary {
    using EnumerableSet for EnumerableSet.Bytes32Set;
    using BaseLedgerLibrary for BaseLedgerMap;

    error LedgerNotExists(address customer, address provider);
    error LedgerExists(address customer, address provider);

    function getLedger(
        InferenceLedgerMap storage map,
        address customer,
        address provider
    ) internal view returns (InferenceLedger memory) {
        BaseLedger storage base = map.baseMap.getLedger(customer, provider);
        InferenceLedgerExtra storage extra = _get(map.extraMap, customer, provider);
        return InferenceLedger(base, extra);
    }

    function getAllLedgers(InferenceLedgerMap storage map) internal view returns (InferenceLedger[] memory ledgers) {
        uint len = _length(map.extraMap);
        ledgers = new InferenceLedger[](len);

        for (uint i = 0; i < len; i++) {
            BaseLedger storage base = map.baseMap.at(i);
            InferenceLedgerExtra storage extra = _at(map.extraMap, i);
            ledgers[i] = InferenceLedger(base, extra);
        }
    }

    function addLedger(
        InferenceLedgerMap storage map,
        address customer,
        address provider,
        uint[2] calldata customerSigner,
        uint amount,
        string memory additionalInfo
    ) internal returns (uint, uint) {
        map.baseMap.addBaseLedger(customer, provider, amount);
        bytes32 key = _key(customer, provider);
        if (_contains(map.extraMap, key)) {
            revert LedgerExists(customer, provider);
        }
        _set(map.extraMap, key, customerSigner, additionalInfo);
        return (amount, 0);
    }

    function deleteLedger(InferenceLedgerMap storage map, address customer, address provider) internal {
        map.baseMap.deleteBaseLedger(customer, provider);
        bytes32 key = _key(customer, provider);
        if (!_contains(map.extraMap, key)) {
            revert LedgerNotExists(customer, provider);
        }
        map.extraMap._keys.remove(key);
        delete map.extraMap._values[key];
    }

    function _at(InferenceLedgerExtraMap storage map, uint index) internal view returns (InferenceLedgerExtra storage) {
        bytes32 key = map._keys.at(index);
        return map._values[key];
    }

    function _contains(InferenceLedgerExtraMap storage map, bytes32 key) internal view returns (bool) {
        return map._keys.contains(key);
    }

    function _length(InferenceLedgerExtraMap storage map) internal view returns (uint) {
        return map._keys.length();
    }

    function _get(
        InferenceLedgerExtraMap storage map,
        address customer,
        address provider
    ) internal view returns (InferenceLedgerExtra storage) {
        bytes32 key = _key(customer, provider);
        InferenceLedgerExtra storage value = map._values[key];
        if (!_contains(map, key)) {
            revert LedgerNotExists(customer, provider);
        }
        return value;
    }

    function _set(
        InferenceLedgerExtraMap storage map,
        bytes32 key,
        uint[2] calldata customerSigner,
        string memory additionalInfo
    ) internal {
        InferenceLedgerExtra storage ledger = map._values[key];
        ledger.customerSigner = customerSigner;
        ledger.additionalInfo = additionalInfo;
        map._keys.add(key);
    }

    function _key(address customer, address provider) internal pure returns (bytes32) {
        return keccak256(abi.encode(customer, provider));
    }
}
