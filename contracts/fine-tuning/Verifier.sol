// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

struct VerifierInput {
    bytes signature;
    bytes16 jobID;
    bytes modelRootHash;
    uint taskFee;
    uint nonce;
    address user;
}

library VerifierLibrary {
    function verifySignature(VerifierInput memory input, address expectedAddress) internal pure returns (bool) {
        bytes32 messageHash = getMessageHash(input);
        bytes32 ethSignedMessageHash = getEthSignedMessageHash(messageHash);

        return recoverSigner(ethSignedMessageHash, input.signature) == expectedAddress;
    }

    function getMessageHash(VerifierInput memory input) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(input.jobID, input.modelRootHash, input.taskFee, input.nonce, input.user));
    }

    function getEthSignedMessageHash(bytes32 messageHash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));
    }

    function recoverSigner(bytes32 ethSignedMessageHash, bytes memory signature) public pure returns (address) {
        (bytes32 r, bytes32 s, uint8 v) = splitSignature(signature);
        return ecrecover(ethSignedMessageHash, v, r, s);
    }

    function splitSignature(bytes memory sig) public pure returns (bytes32 r, bytes32 s, uint8 v) {
        require(sig.length == 65, "invalid signature length");

        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
    }
}
