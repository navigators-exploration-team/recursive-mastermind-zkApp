
import * as readline from 'readline';

const gameGuesses = {
    totalAttempts: [
        [2, 1, 3, 4],
        [8, 3, 7, 1],
        [3, 5, 8, 2],
        [2, 8, 3, 5],
        [5, 8, 3, 2],
        [5, 3, 7, 2],
        [5, 3, 8, 1],
        [3, 1, 7, 2],
        [5, 4, 8, 2],
        [5, 3, 6, 2],
        [5, 3, 8, 9],
        [5, 3, 8, 2],
        [7, 3, 8, 2],
        [5, 2, 8, 3],
        [8, 3, 5, 2],
        [8, 3, 3, 2],
        [7, 1, 3, 8],
        [4, 3, 5, 2],
        [4, 7, 3, 1],
    ],
};

function YatesFisherShuffle(array: number[]) {
    let shuffledArray = [...array];
    for (let i = shuffledArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledArray[i], shuffledArray[j]] = [shuffledArray[j], shuffledArray[i]];
    }
    return shuffledArray;
};

function currentGameClue(guess: number[], solution: number[]) {
    let clue = Array.from({ length: 4 }, () => 0);

    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            const isEqual = Number(guess[i] === solution[j]);
            if (i === j) {
                clue[i] = clue[i] + 2 * isEqual; // 2 for a hit (correct digit and position)
            } else {
                clue[i] = clue[i] + isEqual; // 1 for a blow (correct digit, wrong position)
            }
        }
    }
    return clue;
}

function summedGameClue(guess: number[], solution: number[]) {
    let clue = Array.from({ length: 4 }, () => 0);

    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            const isEqual = Number(guess[i] === solution[j]);
            if (i === j) {
                clue[i] = clue[i] + 2 * isEqual; // 2 for a hit (correct digit and position)
            } else {
                clue[i] = clue[i] + isEqual; // 1 for a blow (correct digit, wrong position)
            }
        }
    }
    return clue.reduce((acc, curr) => acc + curr, 0);
}

function shuffledGameClue(guess: number[], solution: number[]) {
    let clue = Array.from({ length: 4 }, () => 0);

    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            const isEqual = Number(guess[i] === solution[j]);
            if (i === j) {
                clue[i] = clue[i] + 2 * isEqual; // 2 for a hit (correct digit and position)
            } else {
                clue[i] = clue[i] + isEqual; // 1 for a blow (correct digit, wrong position)
            }
        }
    }

    return YatesFisherShuffle(clue);
};


function classicalGameClue(guess: number[], solution: number[]) {
    let clue = {
        hit: 0,
        blow: 0,
    };

    const solutionUsed = Array(4).fill(false);
    const guessUsed = Array(4).fill(false);

    for (let i = 0; i < 4; i++) {
        if (guess[i] === solution[i]) {
            clue.hit++;
            guessUsed[i] = true;
            solutionUsed[i] = true;
        }
    }
    for (let i = 0; i < 4; i++) {
        if (guessUsed[i]) continue;
        for (let j = 0; j < 4; j++) {
            if (solutionUsed[j]) continue;
            if (guess[i] === solution[j]) {
                clue.blow++;
                solutionUsed[j] = true;
                break;
            }
        }
    }
    return clue;
}


const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const summedGame = () => {
    rl.question('Enter a guess (4 digits): ', (answer) => {
        console.log(`You entered: '${answer}'`);

        const guess = answer.split('').map((char) => Number(char));

        const clue = summedGameClue(guess, secret);

        console.log(`Clue is: ${clue}`);

        if (clue === 8) {
            console.log('Congratulations! You guessed the secret!');
            rl.close();
        } else {
            // Continue asking for the next guess
            summedGame();
        }
    });
};

const classicalGame = () => {
    rl.question('Enter a guess (4 digits): ', (answer) => {
        console.log(`You entered: '${answer}'`);

        const guess = answer.split('').map((char) => Number(char));

        const clue = classicalGameClue(guess, secret);

        console.log(`Clue: hits: ${clue.hit}, blows: ${clue.blow} `);
        if (clue.hit === 4) {
            console.log('Congratulations! You guessed the secret!');
            rl.close();
        } else {
            // Continue asking for the next guess
            classicalGame();
        }
    });
};

const shuffledClueGame = () => {
    rl.question('Enter a guess (4 digits): ', (answer) => {
        console.log(`You entered: '${answer}'`);

        const guess = answer.split('').map((char) => Number(char));

        const clue = shuffledGameClue(guess, secret);

        console.log(`Clue is: ${clue.join(' ')}`);
        // If all positions match, end the game
        if (clue.join('') === '2222') {
            console.log('Congratulations! You guessed the secret!');
            rl.close();
        } else {
            // Continue asking for the next guess
            shuffledClueGame();
        }
    });
};

const currentGame = () => {
    rl.question('Enter a guess (4 digits): ', (answer) => {
        console.log(`You entered: '${answer}'`);

        const guess = answer.split('').map((char) => Number(char));

        const clue = currentGameClue(guess, secret);

        console.log(`Clue is: ${clue.join(' ')}`);
        // If all positions match, end the game
        if (clue.join('') === '2222') {
            console.log('Congratulations! You guessed the secret!');
            rl.close();
        } else {
            // Continue asking for the next guess
            currentGame();
        }
    });
};

const secret: number[] = gameGuesses.totalAttempts[8];

process.stdout.write('Start\n');

// currentGame();
// classicalGame();
// summedGame();
shuffledClueGame();




