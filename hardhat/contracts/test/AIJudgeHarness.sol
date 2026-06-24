// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AIJudge} from "../AIJudge.sol";

contract AIJudgeHarness is AIJudge {
    struct MockConvoHistory {
        string storageType;
        string path;
        string secretsName;
    }

    function _runLlm(bytes calldata) internal pure override returns (bytes memory) {
        return
            abi.encode(
                false,
                bytes('{"winnerIndex":0}'),
                bytes(""),
                "",
                MockConvoHistory("", "", "")
            );
    }
}
