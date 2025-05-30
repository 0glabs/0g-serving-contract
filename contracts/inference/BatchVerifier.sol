pragma solidity >=0.7.0 <0.9.0;

library BatchVerifier {
    function GroupOrder() public pure returns (uint256) {
        return
            21888242871839275222246405745257275088548364400416034343698204186575808495617;
    }

    function NegateY(uint256 Y) internal pure returns (uint256) {
        uint256 q = 21888242871839275222246405745257275088696311157297823662689037894645226208583;
        return q - (Y % q);
    }

    function accumulate(
        uint256[] memory in_proof,
        uint256[] memory proof_inputs, // public inputs, length is num_inputs * num_proofs
        uint256 num_proofs
    )
        internal
        view
        returns (
            uint256[] memory proofsAandC,
            uint256[] memory inputAccumulators
        )
    {
        uint256 q = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
        uint256 numPublicInputs = proof_inputs.length / num_proofs;
        uint256[] memory entropy = new uint256[](num_proofs);
        inputAccumulators = new uint256[](numPublicInputs + 1);

        for (uint256 proofNumber = 0; proofNumber < num_proofs; proofNumber++) {
            if (proofNumber == 0) {
                entropy[proofNumber] = 1;
            } else {
                entropy[proofNumber] =
                    uint256(blockhash(block.number - proofNumber)) %
                    q;
            }
            require(entropy[proofNumber] != 0, "Entropy should not be zero");
            // here multiplication by 1 is implied
            inputAccumulators[0] = addmod(
                inputAccumulators[0],
                entropy[proofNumber],
                q
            );
            for (uint256 i = 0; i < numPublicInputs; i++) {
                // accumulate the exponent with extra entropy mod q
                inputAccumulators[i + 1] = addmod(
                    inputAccumulators[i + 1],
                    mulmod(
                        entropy[proofNumber],
                        proof_inputs[proofNumber * numPublicInputs + i],
                        q
                    ),
                    q
                );
            }
            // coefficient for +vk.alpha (mind +) is the same as inputAccumulator[0]
        }

        // inputs for scalar multiplication
        uint256[3] memory mul_input;
        bool success;

        // use scalar multiplications to get proof.A[i] * entropy[i]

        proofsAandC = new uint256[](num_proofs * 2 + 2);

        proofsAandC[0] = in_proof[0];
        proofsAandC[1] = in_proof[1];

        for (uint256 proofNumber = 1; proofNumber < num_proofs; proofNumber++) {
            mul_input[0] = in_proof[proofNumber * 8];
            mul_input[1] = in_proof[proofNumber * 8 + 1];
            mul_input[2] = entropy[proofNumber];
            assembly {
                // ECMUL, output proofsA[i]
                success := staticcall(
                    sub(gas(), 2000),
                    7,
                    mul_input,
                    0x60,
                    mul_input,
                    0x40
                )
            }
            proofsAandC[proofNumber * 2] = mul_input[0];
            proofsAandC[proofNumber * 2 + 1] = mul_input[1];
            require(success, "Failed to call a precompile");
        }

        // use scalar multiplication and addition to get sum(proof.C[i] * entropy[i])

        uint256[4] memory add_input;

        add_input[0] = in_proof[6];
        add_input[1] = in_proof[7];

        for (uint256 proofNumber = 1; proofNumber < num_proofs; proofNumber++) {
            mul_input[0] = in_proof[proofNumber * 8 + 6];
            mul_input[1] = in_proof[proofNumber * 8 + 7];
            mul_input[2] = entropy[proofNumber];
            assembly {
                // ECMUL, output proofsA
                success := staticcall(
                    sub(gas(), 2000),
                    7,
                    mul_input,
                    0x60,
                    add(add_input, 0x40),
                    0x40
                )
            }
            require(
                success,
                "Failed to call a precompile for G1 multiplication for Proof C"
            );

            assembly {
                // ECADD from two elements that are in add_input and output into first two elements of add_input
                success := staticcall(
                    sub(gas(), 2000),
                    6,
                    add_input,
                    0x80,
                    add_input,
                    0x40
                )
            }
            require(
                success,
                "Failed to call a precompile for G1 addition for Proof C"
            );
        }

        proofsAandC[num_proofs * 2] = add_input[0];
        proofsAandC[num_proofs * 2 + 1] = add_input[1];
    }

    function prepareBatches(
        uint256[14] memory in_vk,
        uint256[] memory vk_gammaABC,
        uint256[] memory inputAccumulators
    ) internal view returns (uint256[4] memory finalVksAlphaX) {
        // Compute the linear combination vk_x using accumulator
        // First two fields are used as the sum and are initially zero
        uint256[4] memory add_input;
        uint256[3] memory mul_input;
        bool success;

        // Performs a sum(gammaABC[i] * inputAccumulator[i])
        for (uint256 i = 0; i < inputAccumulators.length; i++) {
            mul_input[0] = vk_gammaABC[2 * i];
            mul_input[1] = vk_gammaABC[2 * i + 1];
            mul_input[2] = inputAccumulators[i];

            assembly {
                // ECMUL, output to the last 2 elements of `add_input`
                success := staticcall(
                    sub(gas(), 2000),
                    7,
                    mul_input,
                    0x60,
                    add(add_input, 0x40),
                    0x40
                )
            }
            require(
                success,
                "Failed to call a precompile for G1 multiplication for input accumulator"
            );

            assembly {
                // ECADD from four elements that are in add_input and output into first two elements of add_input
                success := staticcall(
                    sub(gas(), 2000),
                    6,
                    add_input,
                    0x80,
                    add_input,
                    0x40
                )
            }
            require(
                success,
                "Failed to call a precompile for G1 addition for input accumulator"
            );
        }

        finalVksAlphaX[2] = add_input[0];
        finalVksAlphaX[3] = add_input[1];

        // add one extra memory slot for scalar for multiplication usage
        uint256[3] memory finalVKalpha;
        finalVKalpha[0] = in_vk[0];
        finalVKalpha[1] = in_vk[1];
        finalVKalpha[2] = inputAccumulators[0];

        assembly {
            // ECMUL, output to first 2 elements of finalVKalpha
            success := staticcall(
                sub(gas(), 2000),
                7,
                finalVKalpha,
                0x60,
                finalVKalpha,
                0x40
            )
        }
        require(success, "Failed to call a precompile for G1 multiplication");
        finalVksAlphaX[0] = finalVKalpha[0];
        finalVksAlphaX[1] = finalVKalpha[1];
    }

    // original equation 
    // e(proof.A, proof.B)*e(-vk.alpha, vk.beta)*e(-vk_x, vk.gamma)*e(-proof.C, vk.delta) == 1
    // accumulation of inputs
    // gammaABC[0] + sum[ gammaABC[i+1]^proof_inputs[i] ]
    
    function BatchVerify(
        uint256[14] memory in_vk,
        uint256[] memory vk_gammaABC,
        uint256[] memory in_proof,
        uint256[] memory proof_inputs,
        uint256 num_proofs
    ) internal view returns (bool) {
        require(
            in_proof.length == num_proofs * 8,
            "Invalid proofs length for a batch"
        );
        require(
            proof_inputs.length % num_proofs == 0,
            "Invalid inputs length for a batch"
        );
        require(
            ((vk_gammaABC.length / 2) - 1) == proof_inputs.length / num_proofs
        );

        // strategy is to accumulate entropy separately for some proof elements
        // (accumulate only for G1, can't in G2) of the pairing equation, as well as input verification key,
        // postpone scalar multiplication as much as possible and check only one equation
        // by using 3 + num_proofs pairings only plus 2*num_proofs + (num_inputs+1) + 1 scalar multiplications compared to naive
        // 4*num_proofs pairings and num_proofs*(num_inputs+1) scalar multiplications

        uint256[] memory proofsAandC;
        uint256[] memory inputAccumulators;
        (proofsAandC, inputAccumulators) = accumulate(
            in_proof,
            proof_inputs,
            num_proofs
        );

        uint256[4] memory finalVksAlphaX = prepareBatches(
            in_vk,
            vk_gammaABC,
            inputAccumulators
        );

        uint256[] memory inputs = new uint256[](6 * num_proofs + 18);
        // first num_proofs pairings e(ProofA, ProofB)
        for (uint256 proofNumber = 0; proofNumber < num_proofs; proofNumber++) {
            inputs[proofNumber * 6] = proofsAandC[proofNumber * 2];
            inputs[proofNumber * 6 + 1] = proofsAandC[proofNumber * 2 + 1];
            inputs[proofNumber * 6 + 2] = in_proof[proofNumber * 8 + 2];
            inputs[proofNumber * 6 + 3] = in_proof[proofNumber * 8 + 3];
            inputs[proofNumber * 6 + 4] = in_proof[proofNumber * 8 + 4];
            inputs[proofNumber * 6 + 5] = in_proof[proofNumber * 8 + 5];
        }

        // second pairing e(-finalVKaplha, vk.beta)
        inputs[num_proofs * 6] = finalVksAlphaX[0];
        inputs[num_proofs * 6 + 1] = NegateY(finalVksAlphaX[1]);
        inputs[num_proofs * 6 + 2] = in_vk[2];
        inputs[num_proofs * 6 + 3] = in_vk[3];
        inputs[num_proofs * 6 + 4] = in_vk[4];
        inputs[num_proofs * 6 + 5] = in_vk[5];

        // third pairing e(-finalVKx, vk.gamma)
        inputs[num_proofs * 6 + 6] = finalVksAlphaX[2];
        inputs[num_proofs * 6 + 7] = NegateY(finalVksAlphaX[3]);
        inputs[num_proofs * 6 + 8] = in_vk[6];
        inputs[num_proofs * 6 + 9] = in_vk[7];
        inputs[num_proofs * 6 + 10] = in_vk[8];
        inputs[num_proofs * 6 + 11] = in_vk[9];

        // fourth pairing e(-proof.C, finalVKdelta)
        inputs[num_proofs * 6 + 12] = proofsAandC[num_proofs * 2];
        inputs[num_proofs * 6 + 13] = NegateY(proofsAandC[num_proofs * 2 + 1]);
        inputs[num_proofs * 6 + 14] = in_vk[10];
        inputs[num_proofs * 6 + 15] = in_vk[11];
        inputs[num_proofs * 6 + 16] = in_vk[12];
        inputs[num_proofs * 6 + 17] = in_vk[13];

        uint256 inputsLength = inputs.length * 32;
        uint256[1] memory out;
        require(
            inputsLength % 192 == 0,
            "Inputs length should be multiple of 192 bytes"
        );

        bool success;
        assembly {
            success := staticcall(
                sub(gas(), 2000),
                8,
                add(inputs, 0x20),
                inputsLength,
                out,
                0x20
            )
        }
        return out[0] == 1;
    }
}

contract Wrapper {
    // Verification Key data
    uint256 constant alphax  = 20491192805390485299153009773594534940189261866228447918068658471970481763042;
    uint256 constant alphay  = 9383485363053290200918347156157836566562967994039712273449902621266178545958;
    uint256 constant betax1  = 4252822878758300859123897981450591353533073413197771768651442665752259397132;
    uint256 constant betax2  = 6375614351688725206403948262868962793625744043794305715222011528459656738731;
    uint256 constant betay1  = 21847035105528745403288232691147584728191162732299865338377159692350059136679;
    uint256 constant betay2  = 10505242626370262277552901082094356697409835680220590971873171140371331206856;
    uint256 constant gammax1 = 11559732032986387107991004021392285783925812861821192530917403151452391805634;
    uint256 constant gammax2 = 10857046999023057135944570762232829481370756359578518086990519993285655852781;
    uint256 constant gammay1 = 4082367875863433681332203403145435568316851327593401208105741076214120093531;
    uint256 constant gammay2 = 8495653923123431417604973247489272438418190587263600148770280649306958101930;
    uint256 constant deltax1 = 19087495602129092731461423077886691289633948610773820613518851411392922580638;
    uint256 constant deltax2 = 7255421174618376993418873303202293500165371035395064078729152334156588994339;
    uint256 constant deltay1 = 16177042907535009982581131158611444272160278358409330646448050652978183046578;
    uint256 constant deltay2 = 11096011091195987033865239708005466235792495151015932782006345689641833408644;

    
    uint256 constant IC0x = 15359803934926759720234702264782797207197701262426398452788494009750511912500;
    uint256 constant IC0y = 18070934201811879210439400994580078045645816136926435081975758689399836292047;
    
    uint256 constant IC1x = 7031090531419975985008393578046600624400879801262724499096400997021665279996;
    uint256 constant IC1y = 21516054141714911617446197161612337982506129686951724173410914963446712984765;
    
    uint256 constant IC2x = 6241639573069039417136202525895741082151125070943859224972564953501929366731;
    uint256 constant IC2y = 20540339996784905535225642325263883860357702690804816540453116296388475105006;
    
    uint256 constant IC3x = 1888949858410178293155549885882269192683134790620711784964433403687398639604;
    uint256 constant IC3y = 6857331488305896198414919732838934761456984652086014313103885644585622860363;
    
    uint256 constant IC4x = 6534399369130309812304572740470753638510023791808937040806976755672443751434;
    uint256 constant IC4y = 8440860589489870198796418055698194761430077066999630468570871285292486388603;
    
    uint256 constant IC5x = 20748806689359013895021102083874561365947020004668316384545592977740221901933;
    uint256 constant IC5y = 392041775723031379116926503547911451222323324060863570174325669321406446838;
    
    uint256 constant IC6x = 1822945042049599330101761524999858614539336397098555735427434308112930739081;
    uint256 constant IC6y = 5915120086721054132939483414095345426129272058426226195723018742227944281211;
    
    uint256 constant IC7x = 14706905584485413322181285818648588223623976260550391810672340006000218203041;
    uint256 constant IC7y = 1956813539658592080799805585934005502200204111576119976468246036130271223478;
    
    uint256 constant IC8x = 4670806703165751086340278645485445218201034054109890712136132644902150005812;
    uint256 constant IC8y = 20665693646339862339723495473019819167306113258500294480500883510408286788654;
    
    uint256 constant IC9x = 1304784677261061543539480719078225230874187807452702217337850611044954683792;
    uint256 constant IC9y = 10514169509085933087536872817398142344053892237476589141318689295852477519345;
    

    function getInVk() internal pure returns (uint256[14] memory) {
        return [
            alphax, alphay,
            betax1, betax2, betay1, betay2,
            gammax1, gammax2, gammay1, gammay2,
            deltax1, deltax2, deltay1, deltay2
        ];
    }

    function getVkGammaABC() internal pure returns (uint256[] memory) {
        uint256[] memory result = new uint256[](20);
        
        result[0] = IC0x;
        result[1] = IC0y;
        
        result[2] = IC1x;
        result[3] = IC1y;
        
        result[4] = IC2x;
        result[5] = IC2y;
        
        result[6] = IC3x;
        result[7] = IC3y;
        
        result[8] = IC4x;
        result[9] = IC4y;
        
        result[10] = IC5x;
        result[11] = IC5y;
        
        result[12] = IC6x;
        result[13] = IC6y;
        
        result[14] = IC7x;
        result[15] = IC7y;
        
        result[16] = IC8x;
        result[17] = IC8y;
        
        result[18] = IC9x;
        result[19] = IC9y;
        
        return result;
    }

    function verifyBatch(
        uint256[] calldata in_proof,
        uint256[] calldata proof_inputs,
        uint256 num_proofs
    ) 
    public
    view
    returns (bool success) {
        return BatchVerifier.BatchVerify(getInVk(), getVkGammaABC(), in_proof, proof_inputs, num_proofs);
    }
}