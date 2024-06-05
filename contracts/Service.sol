// SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

struct Service {
    address provider;
    bytes32 serviceType;
    uint price;
    string url;
    uint updatedAt;
}

library ServiceLibrary {
    using EnumerableSet for EnumerableSet.Bytes32Set;

    error ServiceNotexist(address provider, bytes32 serviceType);

    struct ServiceMap {
        EnumerableSet.Bytes32Set _keys;
        mapping(bytes32 => Service) _values;
    }

    function getService(
        ServiceMap storage map,
        address provider,
        bytes32 serviceType
    ) internal view returns (uint, string memory, uint) {
        Service storage value = _get(map, provider, serviceType);
        return (value.price, value.url, value.updatedAt);
    }

    function getAllServices(
        ServiceMap storage map
    )
        internal
        view
        returns (
            address[] memory addresses,
            uint[] memory prices,
            string[] memory urls,
            bytes32[] memory serviceTypes,
            uint[] memory updatedAts
        )
    {
        uint len = _length(map);
        addresses = new address[](len);
        prices = new uint[](len);
        urls = new string[](len);
        serviceTypes = new bytes32[](len);
        updatedAts = new uint[](len);
        for (uint i = 0; i < len; ++i) {
            Service storage value = _at(map, i);
            addresses[i] = value.provider;
            prices[i] = value.price;
            urls[i] = value.url;
            serviceTypes[i] = value.serviceType;
            updatedAts[i] = value.updatedAt;
        }
    }

    function addOrUpdateService(
        ServiceMap storage map,
        address provider,
        bytes32 serviceType,
        uint price,
        string memory url
    ) internal {
        bytes32 key = _key(provider, serviceType);
        if (!_contains(map, key)) {
            _set(map, key, Service(provider, serviceType, price, url, block.timestamp));
            return;
        }
        Service storage value = _get(map, provider, serviceType);
        value.serviceType = serviceType;
        value.price = price;
        value.url = url;
        value.updatedAt = block.timestamp;
    }

    function removeService(ServiceMap storage map, address provider, bytes32 serviceType) internal {
        bytes32 key = _key(provider, serviceType);
        if (!_contains(map, key)) {
            revert ServiceNotexist(provider, serviceType);
        }
        _remove(map, key);
    }

    function _at(ServiceMap storage map, uint index) internal view returns (Service storage) {
        bytes32 key = map._keys.at(index);
        return map._values[key];
    }

    function _set(ServiceMap storage map, bytes32 key, Service memory value) internal returns (bool) {
        map._values[key] = value;
        return map._keys.add(key);
    }

    function _get(
        ServiceMap storage map,
        address provider,
        bytes32 serviceType
    ) internal view returns (Service storage) {
        bytes32 key = _key(provider, serviceType);
        Service storage value = map._values[key];
        if (!_contains(map, key)) {
            revert ServiceNotexist(provider, serviceType);
        }
        return value;
    }

    function _remove(ServiceMap storage map, bytes32 key) internal returns (bool) {
        delete map._values[key];
        return map._keys.remove(key);
    }

    function _contains(ServiceMap storage map, bytes32 key) internal view returns (bool) {
        return map._keys.contains(key);
    }

    function _length(ServiceMap storage map) internal view returns (uint) {
        return map._keys.length();
    }

    function _key(address provider, bytes32 serviceType) internal pure returns (bytes32) {
        return keccak256(abi.encode(provider, serviceType));
    }
}
