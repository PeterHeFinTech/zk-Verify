pragma circom 2.1.6;
include "kyc_template.circom";

// Keep the original UI/input format as the default profile.
component main {public [issuerRoot, currentDay]} = PrivateKYC(3);
