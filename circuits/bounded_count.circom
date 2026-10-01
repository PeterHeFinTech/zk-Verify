pragma circom 2.1.6;

include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/bitify.circom";

// Comparators require bounded inputs; do not rely on the JSON helper.
// Match the documented source schema: one to eight active entries.
template BoundedCount8() {
    signal input count;
    component bits = Num2Bits(4);
    bits.in <== count;
    component belowNine = LessThan(4);
    belowNine.in[0] <== count;
    belowNine.in[1] <== 9;
    belowNine.out === 1;
    component zero = IsZero();
    zero.in <== count;
    zero.out === 0;
}
