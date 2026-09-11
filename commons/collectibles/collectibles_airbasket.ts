import { Collectible, collectibleBuilder } from "../Collectible";

const cb = collectibleBuilder('airbasket');

const collectibles: Collectible[] = [
	cb.skin( 0,   50, 'nooby'),
	cb.coin( 1,  100, 16),
	cb.coin( 2,  150, 9),
	cb.skin( 3,  175, 'kwanita'),
	cb.coin( 4,  200, 15),
	cb.coin( 5,  250, 9),
	cb.coin( 6,  300, 15),
	cb.coin( 7,  350, 9),
	cb.skin( 8,  400, 'willy'),
	cb.coin( 9,  450, 9),
	cb.coin(10,  500, 25),
	cb.coin(11,  550, 9),
	cb.coin(12,  600, 18),
	cb.coin(13,  650, 13),
	cb.coin(14,  700, 18),
	cb.coin(15,  750, 13),
	cb.coin(16,  800, 18),
	cb.coin(17,  850, 18),
	cb.coin(18,  900, 23),
	cb.coin(19,  950, 24),
	cb.coin(20, 1000, 50),
];


export default collectibles;
