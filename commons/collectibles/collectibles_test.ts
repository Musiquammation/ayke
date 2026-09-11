import { Collectible } from "../Collectible";

const collectibles: Collectible[] = [
    {
        id: 0,
        name: "test0",
        async drawIcon(ctx, size) {
            ctx.fillStyle = "#f87";
            ctx.fillRect(0, 0, size, size);
        },
        arg: "(argument)",
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
        arg: "(argument)",
        apply: 'test',
        trophees: 50
    },

    {
        id: 2,
        name: "test2",
        async drawIcon(ctx, size) {
            ctx.fillStyle = "#f87";
            ctx.fillRect(0, 0, size, size);
        },
        arg: "(argument)",
        apply: 'test',
        trophees: 100
    },

    {
        id: 3,
        name: "test3",
        async drawIcon(ctx, size) {
            ctx.fillStyle = "#88f";
            ctx.fillRect(0, 0, size, size);
        },
        arg: "(argument)",
        apply: 'test',
        trophees: 200
    },

    {
        id: 4,
        name: "test4",
        async drawIcon(ctx, size) {
            ctx.fillStyle = "#f87";
            ctx.fillRect(0, 0, size, size);
        },
        arg: "(argument)",
        apply: 'test',
        trophees: 250
    },

    {
        id: 5,
        name: "test5",
        async drawIcon(ctx, size) {
            ctx.fillStyle = "#88f";
            ctx.fillRect(0, 0, size, size);
        },
        arg: "(argument)",
        apply: 'test',
        trophees: 500
    },
];


export default collectibles;