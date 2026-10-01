pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "bounded_count.circom";
include "circomlib/circuits/comparators.circom";

// Bounded exact-match research circuit, not a complete PSI protocol.
// Input identifiers must already be canonicalised to field elements.
// Unused slots must be zero. Both commitments bind the full eight-slot vectors.
template PrivateScreening() {
    signal input customers[8];
    signal input watchlist[8];
    signal input customerCount;
    signal input watchlistCount;
    signal input customerRoot;
    signal input watchlistRoot;

    component customerHash = Poseidon(8);
    component watchlistHash = Poseidon(8);
    component customerActive[8];
    component watchlistActive[8];
    signal customerFlags[8];
    signal watchlistFlags[8];

    component customerLimit = BoundedCount8();
    customerLimit.count <== customerCount;
    component watchlistLimit = BoundedCount8();
    watchlistLimit.count <== watchlistCount;

    for (var i = 0; i < 8; i++) {
        customerHash.inputs[i] <== customers[i];
        watchlistHash.inputs[i] <== watchlist[i];
        customerActive[i] = LessThan(4);
        customerActive[i].in[0] <== i;
        customerActive[i].in[1] <== customerCount;
        customerFlags[i] <== customerActive[i].out;
        watchlistActive[i] = LessThan(4);
        watchlistActive[i].in[0] <== i;
        watchlistActive[i].in[1] <== watchlistCount;
        watchlistFlags[i] <== watchlistActive[i].out;
        (1 - customerFlags[i]) * customers[i] === 0;
        (1 - watchlistFlags[i]) * watchlist[i] === 0;
    }
    customerHash.out === customerRoot;
    watchlistHash.out === watchlistRoot;

    component equal[8][8];
    signal bothActive[8][8];
    for (var c = 0; c < 8; c++) {
        for (var w = 0; w < 8; w++) {
            equal[c][w] = IsEqual();
            equal[c][w].in[0] <== customers[c];
            equal[c][w].in[1] <== watchlist[w];
            bothActive[c][w] <== customerFlags[c] * watchlistFlags[w];
            bothActive[c][w] * equal[c][w].out === 0;
        }
    }
}

component main {public [customerRoot, watchlistRoot, customerCount, watchlistCount]} = PrivateScreening();
