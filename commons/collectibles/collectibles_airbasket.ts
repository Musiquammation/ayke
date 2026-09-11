import { Collectible, collectibleBuilder } from "../Collectible";

const cb = collectibleBuilder('airbasket');

const collectibles: Collectible[] = [
    cb.skin( 0,   50, 'nooby'),
    cb.coin( 0,  100, 16),
    cb.coin( 0,  150, 9),
    cb.skin( 0,  175, 'kwanita'),
    cb.coin( 0,  200, 15),
    cb.coin( 0,  250, 9),
    cb.coin( 0,  300, 15),
    cb.coin( 0,  350, 9),
    cb.skin( 0,  400, 'willy'),
    cb.coin( 0,  450, 9),
    cb.coin( 0,  500, 25),
    cb.coin( 0,  550, 9),
    cb.coin( 0,  600, 18),
    cb.coin( 0,  650, 13),
    cb.coin( 0,  700, 18),
    cb.coin( 0,  750, 13),
    cb.coin( 0,  800, 18),
    cb.coin( 0,  850, 18),
    cb.coin( 0,  900, 23),
    cb.coin( 0,  950, 24),
    cb.coin( 0, 1000, 50),
];


export default collectibles;
