import { Collectible } from "../Collectible";

const collectibles: Collectible[] = [
    {
        id: 0,
        name: "test0",
        async drawIcon(ctx, size) {
            ctx.fillStyle = "#f87";
            ctx.fillRect(0, 0, size, size);
        },
        apply: 'test',
        trophees: 10
    },

    {
        id: 1,
        name: "test1",
        async drawIcon(ctx, size) {
            ctx.fillStyle = "#88f";
            ctx.fillRect(0, 0, size, size);
        },
        apply: 'test',
        trophees: 30
    }
];


export default collectibles;