/*
============================================================
SONICCRYPT TRANSMITTER
============================================================

16-FSK ACOUSTIC DATA TRANSMISSION

Frequencies:

0  = 1000 Hz
1  = 1200 Hz
2  = 1400 Hz
3  = 1600 Hz
4  = 1800 Hz
5  = 2000 Hz
6  = 2200 Hz
7  = 2400 Hz
8  = 2600 Hz
9  = 2800 Hz
A  = 3000 Hz
B  = 3200 Hz
C  = 3400 Hz
D  = 3600 Hz
E  = 3800 Hz
F  = 4000 Hz

PROTOCOL:

PREAMBLE
SCX1
VERSION
FILENAME
MIME TYPE
FILE SIZE
CRC32
PAYLOAD

PAYLOAD:

5 random bits
+
8 actual data bits

============================================================
*/


/* =========================================================
   AUDIO SETTINGS
========================================================= */

const SAMPLE_RATE = 44100;


/*
 * 16-FSK
 */

const FREQUENCIES =
    Array.from(
        { length: 16 },
        (_, i) => 1000 + i * 200
    );


/*
 * IMPORTANT:
 *
 * Turbo:
 * 132 samples / 44100 Hz
 * ≈ 2.99 ms
 *
 * Reliable:
 * 264 samples / 44100 Hz
 * ≈ 5.99 ms
 *
 * These are the actual sample counts used to
 * generate the audio.
 */

const MODE_SAMPLE_COUNTS = {

    turbo: 132,

    reliable: 264
};


const MODES = {

    turbo:
        MODE_SAMPLE_COUNTS.turbo /
        SAMPLE_RATE,

    reliable:
        MODE_SAMPLE_COUNTS.reliable /
        SAMPLE_RATE
};


let currentMode =
    "turbo";


/* =========================================================
   SYNCHRONIZATION PREAMBLE
========================================================= */

/*
 * Strong alternating 1000 / 4000 Hz signal.
 *
 * This gives the receiver something obvious to
 * detect before SCX1 begins.
 *
 * 48 symbols is approximately:
 *
 * Turbo:
 * 48 × 2.99 ms ≈ 143.7 ms
 *
 * Reliable:
 * 48 × 5.99 ms ≈ 287.7 ms
 */

const PREAMBLE = [];


for (
    let i = 0;
    i < 48;
    i++
) {

    PREAMBLE.push(
        i % 2 === 0
            ? 0
            : 15
    );
}


/*
 * SCX1 itself.
 *
 * S = 0x53 -> 5,3
 * C = 0x43 -> 4,3
 * X = 0x58 -> 5,8
 * 1 = 0x31 -> 3,1
 */

const MAGIC_SYMBOLS = [
    5, 3,
    4, 3,
    5, 8,
    3, 1
];


/* =========================================================
   STATE
========================================================= */

let selectedFile =
    null;


let transmissionSymbols =
    [];


let audioBuffer =
    null;


let audioContext =
    null;


let sourceNode =
    null;


let isPlaying =
    false;


let isPaused =
    false;


let transmissionStart =
    0;


let pausedAt =
    0;


let animationFrame =
    null;


/* =========================================================
   ELEMENTS
========================================================= */

const fileInput =
    document.getElementById(
        "fileInput"
    );


const fileInfo =
    document.getElementById(
        "fileInfo"
    );


const imagePreview =
    document.getElementById(
        "imagePreview"
    );


const previewContainer =
    document.getElementById(
        "previewContainer"
    );


const statusElement =
    document.getElementById(
        "status"
    );


const elapsedTime =
    document.getElementById(
        "elapsedTime"
    );


const remainingTime =
    document.getElementById(
        "remainingTime"
    );


const totalTime =
    document.getElementById(
        "totalTime"
    );


const progressFill =
    document.getElementById(
        "progressFill"
    );


const progressPercent =
    document.getElementById(
        "progressPercent"
    );


const playButton =
    document.getElementById(
        "playButton"
    );


const pauseButton =
    document.getElementById(
        "pauseButton"
    );


const stopButton =
    document.getElementById(
        "stopButton"
    );


const dataSize =
    document.getElementById(
        "dataSize"
    );


const encodedBits =
    document.getElementById(
        "encodedBits"
    );


const symbolCount =
    document.getElementById(
        "symbolCount"
    );


const symbolSpeed =
    document.getElementById(
        "symbolSpeed"
    );


const canvas =
    document.getElementById(
        "waveformCanvas"
    );


const ctx =
    canvas.getContext(
        "2d"
    );


const logElement =
    document.getElementById(
        "log"
    );


const turboButton =
    document.getElementById(
        "turboMode"
    );


const reliableButton =
    document.getElementById(
        "reliableMode"
    );


const modeInfo =
    document.getElementById(
        "modeInfo"
    );


/* =========================================================
   LOG
========================================================= */

function log(message) {

    if (!logElement) {
        return;
    }


    const entry =
        document.createElement(
            "div"
        );


    entry.className =
        "log-entry";


    entry.innerHTML =
        `<span class="log-time">
            [${new Date().toLocaleTimeString()}]
        </span> ${message}`;


    logElement.appendChild(
        entry
    );


    logElement.scrollTop =
        logElement.scrollHeight;
}


/* =========================================================
   MODE
========================================================= */

turboButton.onclick =
    () => {

        setMode(
            "turbo"
        );
    };


reliableButton.onclick =
    () => {

        setMode(
            "reliable"
        );
    };


function setMode(
    mode
) {

    if (
        isPlaying ||
        isPaused
    ) {

        return;
    }


    currentMode =
        mode;


    turboButton.classList.toggle(
        "active",
        mode === "turbo"
    );


    reliableButton.classList.toggle(
        "active",
        mode === "reliable"
    );


    if (
        mode === "turbo"
    ) {

        modeInfo.textContent =
            "TURBO: ~3 ms symbols.";

    } else {

        modeInfo.textContent =
            "RELIABLE: ~6 ms symbols.";
    }


    if (
        selectedFile
    ) {

        prepareTransmission(
            selectedFile
        );
    }
}


/* =========================================================
   FILE SELECTION
========================================================= */

fileInput.addEventListener(
    "change",
    async () => {

        const file =
            fileInput.files[0];


        if (!file) {
            return;
        }


        stopTransmission();


        selectedFile =
            file;


        fileInfo.textContent =
            `${file.name} — ${formatBytes(
                file.size
            )}`;


        dataSize.textContent =
            formatBytes(
                file.size
            );


        /*
         * Image preview.
         */

        if (
            file.type.startsWith(
                "image/"
            )
        ) {

            const url =
                URL.createObjectURL(
                    file
                );


            imagePreview.src =
                url;


            previewContainer.style.display =
                "block";

        } else {

            previewContainer.style.display =
                "none";
        }


        log(
            `Selected: ${file.name}`
        );


        await prepareTransmission(
            file
        );
    }
);


/* =========================================================
   PREPARE TRANSMISSION
========================================================= */

async function prepareTransmission(
    file
) {

    statusElement.textContent =
        "ENCODING";


    const buffer =
        await file.arrayBuffer();


    const bytes =
        new Uint8Array(
            buffer
        );


    /*
     * Build header.
     */

    const header =
        buildHeader(
            file.name,
            file.type ||
                "application/octet-stream",
            bytes.length,
            crc32(bytes)
        );


    /*
     * Header is normal 8-bit data.
     */

    const headerBits =
        bytesToBits(
            header
        );


    /*
     * Payload:
     *
     * 5 random bits
     * +
     * 8 data bits
     */

    const payloadBits =
        encodeCustomBits(
            bytes
        );


    /*
     * Combine header + payload.
     */

    const allBits = [
        ...headerBits,
        ...payloadBits
    ];


    /*
     * Convert four bits into
     * one 16-FSK symbol.
     */

    const dataSymbols =
        bitsToSymbols(
            allBits
        );


    /*
     * FINAL TRANSMISSION:
     *
     * PREAMBLE
     * +
     * SCX1
     * +
     * DATA
     */

    transmissionSymbols = [

        ...PREAMBLE,

        ...MAGIC_SYMBOLS,

        ...dataSymbols
    ];


    const duration =
        transmissionSymbols.length *
        MODES[currentMode];


    /*
     * UI.
     */

    encodedBits.textContent =
        allBits.length.toLocaleString();


    symbolCount.textContent =
        transmissionSymbols.length.toLocaleString();


    symbolSpeed.textContent =
        `${Math.round(
            1 /
            MODES[currentMode]
        )}/sec`;


    totalTime.textContent =
        formatTime(
            duration
        );


    remainingTime.textContent =
        formatTime(
            duration
        );


    elapsedTime.textContent =
        "00:00";


    progressFill.style.width =
        "0%";


    progressPercent.textContent =
        "0%";


    /*
     * LOG.
     */

    log(
        `File: ${file.name}`
    );


    log(
        `Original size: ${
            bytes.length.toLocaleString()
        } bytes`
    );


    log(
        `Header: ${
            header.length
        } bytes`
    );


    log(
        `Payload: ${
            payloadBits.length.toLocaleString()
        } bits`
    );


    log(
        `Preamble: ${
            PREAMBLE.length
        } symbols`
    );


    log(
        "SCX1 synchronization header added."
    );


    log(
        `Total symbols: ${
            transmissionSymbols.length.toLocaleString()
        }`
    );


    log(
        `Symbol duration: ${
            (
                MODES[currentMode] *
                1000
            ).toFixed(2)
        } ms`
    );


    log(
        `Estimated time: ${
            formatTime(duration)
        }`
    );


    statusElement.textContent =
        "GENERATING AUDIO";


    /*
     * Generate audio.
     */

    audioBuffer =
        createAudioBuffer(
            transmissionSymbols
        );


    /*
     * Draw waveform.
     */

    drawWaveform(
        audioBuffer
    );


    statusElement.textContent =
        "READY";


    playButton.disabled =
        false;


    pauseButton.disabled =
        true;


    stopButton.disabled =
        true;
}


/* =========================================================
   HEADER
========================================================= */

/*
 * SCX1
 *
 * 4 magic bytes
 * 1 version
 * 2 filename length
 * filename
 * 2 MIME length
 * MIME
 * 4 file size
 * 4 CRC32
 */

function buildHeader(
    name,
    mime,
    fileSize,
    checksum
) {

    const encoder =
        new TextEncoder();


    const nameBytes =
        encoder.encode(
            name
        );


    const mimeBytes =
        encoder.encode(
            mime
        );


    const result = [];


    /*
     * MAGIC
     *
     * SCX1
     */

    result.push(
        0x53,
        0x43,
        0x58,
        0x31
    );


    /*
     * VERSION
     */

    result.push(
        1
    );


    /*
     * FILE NAME LENGTH
     */

    result.push(

        (
            nameBytes.length >>
            8
        ) & 0xff,

        nameBytes.length &
            0xff
    );


    /*
     * FILE NAME
     */

    result.push(
        ...nameBytes
    );


    /*
     * MIME LENGTH
     */

    result.push(

        (
            mimeBytes.length >>
            8
        ) & 0xff,

        mimeBytes.length &
            0xff
    );


    /*
     * MIME
     */

    result.push(
        ...mimeBytes
    );


    /*
     * FILE SIZE
     */

    result.push(

        (
            fileSize >>> 24
        ) & 0xff,

        (
            fileSize >>> 16
        ) & 0xff,

        (
            fileSize >>> 8
        ) & 0xff,

        fileSize &
            0xff
    );


    /*
     * CRC32
     */

    result.push(

        (
            checksum >>> 24
        ) & 0xff,

        (
            checksum >>> 16
        ) & 0xff,

        (
            checksum >>> 8
        ) & 0xff,

        checksum &
            0xff
    );


    return new Uint8Array(
        result
    );
}


/* =========================================================
   CUSTOM PROTOCOL
========================================================= */

/*
 * Each original byte becomes:
 *
 * R R R R R
 * D D D D D D D D
 *
 * 13 total bits.
 */

function encodeCustomBits(
    bytes
) {

    const bits = [];


    for (
        const byte
        of bytes
    ) {

        /*
         * RANDOM 5 BITS
         */

        const randomBits =
            new Uint8Array(
                5
            );


        crypto.getRandomValues(
            randomBits
        );


        for (
            let i = 0;
            i < 5;
            i++
        ) {

            bits.push(
                randomBits[i] &
                1
            );
        }


        /*
         * ACTUAL 8 BITS
         */

        for (
            let i = 7;
            i >= 0;
            i--
        ) {

            bits.push(
                (
                    byte >>
                    i
                ) & 1
            );
        }
    }


    return bits;
}


/* =========================================================
   BYTES TO BITS
========================================================= */

function bytesToBits(
    bytes
) {

    const bits = [];


    for (
        const byte
        of bytes
    ) {

        for (
            let i = 7;
            i >= 0;
            i--
        ) {

            bits.push(
                (
                    byte >>
                    i
                ) & 1
            );
        }
    }


    return bits;
}


/* =========================================================
   BITS TO 16-FSK SYMBOLS
========================================================= */

function bitsToSymbols(
    bits
) {

    const symbols = [];


    for (
        let i = 0;
        i < bits.length;
        i += 4
    ) {

        let value = 0;


        for (
            let j = 0;
            j < 4;
            j++
        ) {

            value <<=
                1;


            if (
                i + j <
                bits.length
            ) {

                value |=
                    bits[i + j];
            }
        }


        symbols.push(
            value
        );
    }


    return symbols;
}


/* =========================================================
   AUDIO GENERATION
========================================================= */

function createAudioBuffer(
    symbols
) {

    const samplesPerSymbol =
        MODE_SAMPLE_COUNTS[
            currentMode
        ];


    const totalSamples =
        samplesPerSymbol *
        symbols.length;


    const buffer =
        new AudioBuffer({

            length:
                totalSamples,

            numberOfChannels:
                1,

            sampleRate:
                SAMPLE_RATE
        });


    const channel =
        buffer.getChannelData(
            0
        );


    let position = 0;


    /*
     * Phase is maintained across symbols.
     *
     * This makes the generated signal cleaner
     * and reduces discontinuities.
     */

    let phase = 0;


    for (
        const symbol
        of symbols
    ) {

        const frequency =
            FREQUENCIES[
                symbol
            ];


        /*
         * Small fades stop hard clicks.
         *
         * Because the receiver analyzes the middle
         * of each symbol, these fades do not interfere
         * with decoding.
         */

        const fadeSamples =
            Math.min(
                12,
                Math.floor(
                    samplesPerSymbol /
                    6
                )
            );


        const phaseStep =
            (
                2 *
                Math.PI *
                frequency
            ) /
            SAMPLE_RATE;


        for (
            let i = 0;
            i < samplesPerSymbol;
            i++
        ) {

            let envelope =
                1;


            if (
                i <
                fadeSamples
            ) {

                envelope =
                    i /
                    fadeSamples;

            } else if (
                i >=
                samplesPerSymbol -
                fadeSamples
            ) {

                envelope =
                    (
                        samplesPerSymbol -
                        i
                    ) /
                    fadeSamples;
            }


            channel[position++] =
                Math.sin(
                    phase
                ) *
                0.45 *
                envelope;


            phase +=
                phaseStep;


            /*
             * Keep phase bounded.
             */

            if (
                phase >
                Math.PI * 2
            ) {

                phase -=
                    Math.PI * 2;
            }
        }
    }


    return buffer;
}


/* =========================================================
   PLAY
========================================================= */

playButton.onclick =
    async () => {

        if (
            !audioBuffer
        ) {

            return;
        }


        if (
            isPaused
        ) {

            await resumeTransmission();

        } else {

            await startTransmission();
        }
    };


async function startTransmission() {

    stopAudioOnly();


    /*
     * Use the generated buffer's sample rate.
     */

    audioContext =
        new AudioContext();


    await audioContext.resume();


    sourceNode =
        audioContext
            .createBufferSource();


    sourceNode.buffer =
        audioBuffer;


    sourceNode.connect(
        audioContext.destination
    );


    sourceNode.onended =
        () => {

            if (
                isPlaying
            ) {

                finishTransmission();
            }
        };


    sourceNode.start();


    transmissionStart =
        audioContext.currentTime;


    pausedAt = 0;


    isPlaying =
        true;


    isPaused =
        false;


    statusElement.textContent =
        "TRANSMITTING";


    playButton.disabled =
        true;


    pauseButton.disabled =
        false;


    stopButton.disabled =
        false;


    log(
        "Transmission started."
    );


    updateTimer();
}


/* =========================================================
   PAUSE
========================================================= */

pauseButton.onclick =
    async () => {

        if (
            !audioContext ||
            !isPlaying
        ) {

            return;
        }


        pausedAt =
            audioContext.currentTime -
            transmissionStart;


        await audioContext.suspend();


        isPlaying =
            false;


        isPaused =
            true;


        statusElement.textContent =
            "PAUSED";


        playButton.textContent =
            "RESUME";


        playButton.disabled =
            false;


        pauseButton.disabled =
            true;


        log(
            "Transmission paused."
        );
    };


/* =========================================================
   RESUME
========================================================= */

async function resumeTransmission() {

    await audioContext.resume();


    transmissionStart =
        audioContext.currentTime -
        pausedAt;


    isPlaying =
        true;


    isPaused =
        false;


    statusElement.textContent =
        "TRANSMITTING";


    playButton.disabled =
        true;


    pauseButton.disabled =
        false;


    log(
        "Transmission resumed."
    );


    updateTimer();
}


/* =========================================================
   STOP
========================================================= */

stopButton.onclick =
    () => {

        stopTransmission();
    };


function stopTransmission() {

    isPlaying =
        false;


    isPaused =
        false;


    stopAudioOnly();


    pausedAt = 0;


    cancelAnimationFrame(
        animationFrame
    );


    const duration =
        audioBuffer
            ? audioBuffer.duration
            : 0;


    elapsedTime.textContent =
        "00:00";


    remainingTime.textContent =
        formatTime(
            duration
        );


    progressFill.style.width =
        "0%";


    progressPercent.textContent =
        "0%";


    statusElement.textContent =
        audioBuffer
            ? "READY"
            : "WAITING FOR FILE";


    playButton.textContent =
        "PLAY";


    playButton.disabled =
        !audioBuffer;


    pauseButton.disabled =
        true;


    stopButton.disabled =
        true;


    log(
        "Transmission stopped."
    );
}


/* =========================================================
   STOP AUDIO ONLY
========================================================= */

function stopAudioOnly() {

    if (
        sourceNode
    ) {

        try {

            sourceNode.stop();

        } catch {}


        try {

            sourceNode.disconnect();

        } catch {}


        sourceNode =
            null;
    }


    if (
        audioContext
    ) {

        try {

            audioContext.close();

        } catch {}


        audioContext =
            null;
    }
}


/* =========================================================
   FINISH
========================================================= */

function finishTransmission() {

    isPlaying =
        false;


    isPaused =
        false;


    cancelAnimationFrame(
        animationFrame
    );


    statusElement.textContent =
        "TRANSMISSION COMPLETE";


    playButton.disabled =
        false;


    pauseButton.disabled =
        true;


    stopButton.disabled =
        true;


    progressFill.style.width =
        "100%";


    progressPercent.textContent =
        "100%";


    elapsedTime.textContent =
        formatTime(
            audioBuffer.duration
        );


    remainingTime.textContent =
        "00:00";


    log(
        "Transmission complete."
    );


    if (
        audioContext
    ) {

        try {

            audioContext.close();

        } catch {}


        audioContext =
            null;
    }


    sourceNode =
        null;
}


/* =========================================================
   TIMER
========================================================= */

function updateTimer() {

    if (
        !isPlaying ||
        !audioContext
    ) {

        return;
    }


    const elapsed =
        audioContext.currentTime -
        transmissionStart;


    const total =
        audioBuffer.duration;


    const progress =
        Math.min(
            1,
            elapsed /
            total
        );


    elapsedTime.textContent =
        formatTime(
            elapsed
        );


    remainingTime.textContent =
        formatTime(
            Math.max(
                0,
                total -
                elapsed
            )
        );


    progressFill.style.width =
        `${progress * 100}%`;


    progressPercent.textContent =
        `${Math.floor(
            progress * 100
        )}%`;


    animationFrame =
        requestAnimationFrame(
            updateTimer
        );
}


/* =========================================================
   WAVEFORM
========================================================= */

function drawWaveform(
    buffer
) {

    canvas.width =
        canvas.clientWidth *
        window.devicePixelRatio;


    canvas.height =
        canvas.clientHeight *
        window.devicePixelRatio;


    ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
    );


    const data =
        buffer.getChannelData(
            0
        );


    const center =
        canvas.height /
        2;


    const step =
        Math.max(
            1,
            Math.floor(
                data.length /
                canvas.width
            )
        );


    ctx.beginPath();


    for (
        let x = 0;
        x < canvas.width;
        x++
    ) {

        const value =
            data[
                x * step
            ] || 0;


        const y =
            center +
            value *
            center *
            0.85;


        if (
            x === 0
        ) {

            ctx.moveTo(
                x,
                y
            );

        } else {

            ctx.lineTo(
                x,
                y
            );
        }
    }


    ctx.strokeStyle =
        "#4aa8ff";


    ctx.lineWidth =
        1;


    ctx.stroke();
}


/* =========================================================
   CRC32
========================================================= */

function crc32(
    bytes
) {

    let crc =
        0xffffffff;


    for (
        const byte
        of bytes
    ) {

        crc ^=
            byte;


        for (
            let i = 0;
            i < 8;
            i++
        ) {

            crc =
                (
                    crc >>> 1
                ) ^
                (
                    -(
                        crc & 1
                    ) &
                    0xedb88320
                );
        }
    }


    return (
        crc ^
        0xffffffff
    ) >>> 0;
}


/* =========================================================
   FORMAT TIME
========================================================= */

function formatTime(
    seconds
) {

    seconds =
        Math.max(
            0,
            Math.floor(
                seconds
            )
        );


    const hours =
        Math.floor(
            seconds /
            3600
        );


    const minutes =
        Math.floor(
            (
                seconds %
                3600
            ) /
            60
        );


    const secs =
        seconds %
        60;


    if (
        hours > 0
    ) {

        return (

            String(hours)
                .padStart(
                    2,
                    "0"
                )

            +

            ":"

            +

            String(minutes)
                .padStart(
                    2,
                    "0"
                )

            +

            ":"

            +

            String(secs)
                .padStart(
                    2,
                    "0"
                )
        );
    }


    return (

        String(minutes)
            .padStart(
                2,
                "0"
            )

        +

        ":"

        +

        String(secs)
            .padStart(
                2,
                "0"
            )
    );
}


/* =========================================================
   FORMAT BYTES
========================================================= */

function formatBytes(
    bytes
) {

    if (
        bytes === 0
    ) {

        return "0 B";
    }


    const units = [
        "B",
        "KB",
        "MB",
        "GB"
    ];


    const index =
        Math.min(
            units.length - 1,
            Math.floor(
                Math.log(bytes) /
                Math.log(1024)
            )
        );


    return (

        (
            bytes /
            Math.pow(
                1024,
                index
            )
        ).toFixed(
            index === 0
                ? 0
                : 2
        )

        +

        " "

        +

        units[index]
    );
}


/* =========================================================
   INITIALIZATION
========================================================= */

playButton.disabled =
    true;


pauseButton.disabled =
    true;


stopButton.disabled =
    true;


turboButton.classList.add(
    "active"
);


if (
    modeInfo
) {

    modeInfo.textContent =
        "TURBO: ~3 ms symbols.";
}


log(
    "SONICCRYPT transmitter initialized."
);


log(
    "16-FSK: 1000-4000 Hz."
);


log(
    "SCX1 protocol enabled."
);


log(
    "48-symbol synchronization preamble enabled."
);


log(
    "Turbo: ~3 ms symbols."
);


log(
    "Reliable: ~6 ms symbols."
);
