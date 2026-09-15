// The zombie AI's states. The host sends each zombie's state to guests as this
// number in every snapshot, so the values are part of the wire format.
const ZSTATES = { RISE: 0, APPROACH: 1, TEAR: 2, CLIMB: 3, CHASE: 4, ATTACK: 5, DIE: 6, CRAWLER: 7 };

export { ZSTATES };
