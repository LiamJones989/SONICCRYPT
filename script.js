"use strict";

/*
    ============================================================
    SONICCRYPT
    STAGE 1 — SIMPLE ACOUSTIC TRANSMISSION
    ============================================================

    This is intentionally NOT the final SONICCRYPT protocol.

    2-FSK:

        0 = 1200 Hz
        1 = 2400 Hz

    One bit = 100 milliseconds.

    Packet:

        24-bit alternating preamble
        8-bit message length
        message bytes
        8-bit end marker

    The goal is simply to prove:

        COMPUTER
            ↓
        SPEAKER
            ↓
           AIR
            ↓
        MICROPHONE
            ↓
        RECEIVER

    Once this works, we build the real protocol on top.
*/


const ZERO_FREQUENCY = 1200;
const ONE_FREQUENCY = 2400;

const SYMBOL_DURATION = 0.100;

const PREAMBLE_BITS = 24;

const END_MARKER = [
    1, 1, 1, 1,
    0, 0, 0, 0
];


let audioContext = null;

let activeOscillators = [];

let isTransmitting = false;

let transmissionTimer = null;


const messageInput =
    document.getElementById("message");

const sendButton =
    document.getElementById("sendButton");

const stopButton =
    document.getElementById("stopButton");

const statusBox =
    document.getElementById("status");

const progressBar =
    document.getElementById("progressBar");

const progressText =
    document.getElementById("progressText");

const logBox =
    document.getElementById("log");


/*
    ============================================================
    LOGGING
    ============================================================
*/

function log(message) {

    const now =
        new Date().toLocaleTimeString();

    const line =
        document.createElement("div");

    line.className = "log-line";

    line.textContent =
        `[${now}] ${message}`;

    logBox.appendChild(line);

    logBox.scrollTop =
        logBox.scrollHeight;
}


/*
    ============================================================
    TEXT → BYTES
    ============================================================
*/

function textToBytes(text) {

    return new TextEncoder().encode(text);
}


/*
    ============================================================
    BYTE → 8 BITS
    ============================================================
*/

function byteToBits(byte) {

    const bits = [];

    for (let i = 7; i >= 0; i--) {

        bits.push(
            (byte >> i) & 1
        );
    }

    return bits;
}


/*
    ============================================================
    BUILD PACKET
    ============================================================
*/

function buildPacket(text) {

    const bytes =
        textToBytes(text);


    if (bytes.length > 255) {

        throw new Error(
            "Message is too long. Maximum is 255 bytes."
        );
    }


    const bits = [];


    /*
        PREAMBLE

        101010101010...
    */
    for (
        let i = 0;
        i < PREAMBLE_BITS;
        i++
    ) {

        bits.push(
            i % 2
        );
    }


    /*
        MESSAGE LENGTH
    */
    bits.push(
        ...byteToBits(bytes.length)
    );


    /*
        MESSAGE
    */
    for (const byte of bytes) {

        bits.push(
            ...byteToBits(byte)
        );
    }


    /*
        END MARKER
    */
    bits.push(
        ...END_MARKER
    );


    return {
        bits,
        bytes
    };
}


/*
    ============================================================
    CREATE ONE TONE
    ============================================================
*/

function createTone(
    frequency,
    startTime,
    duration
) {

    const oscillator =
        audioContext.createOscillator();

    const gain =
        audioContext.createGain();


    oscillator.type =
        "sine";

    oscillator.frequency.setValueAtTime(
        frequency,
        startTime
    );


    /*
        Small fade to eliminate clicks.
    */

    const fade =
        0.008;


    gain.gain.setValueAtTime(
        0,
        startTime
    );


    gain.gain.linearRampToValueAtTime(
        0.35,
        startTime + fade
    );


    gain.gain.setValueAtTime(
        0.35,
        startTime + duration - fade
    );


    gain.gain.linearRampToValueAtTime(
        0,
        startTime + duration
    );


    oscillator.connect(gain);

    gain.connect(
        audioContext.destination
    );


    oscillator.start(
        startTime
    );

    oscillator.stop(
        startTime + duration
    );


    activeOscillators.push(
        oscillator
    );
}


/*
    ============================================================
    STOP EVERYTHING
    ============================================================
*/

function stopTransmission() {

    if (!isTransmitting) {
        return;
    }


    isTransmitting = false;


    if (transmissionTimer) {

        clearInterval(
            transmissionTimer
        );

        transmissionTimer = null;
    }


    for (
        const oscillator
        of activeOscillators
    ) {

        try {
            oscillator.stop();
        } catch {
            // Already stopped.
        }
    }


    activeOscillators = [];


    if (audioContext) {

        audioContext.close();

        audioContext = null;
    }


    sendButton.disabled = false;

    stopButton.disabled = true;


    progressBar.style.width =
        "0%";

    progressText.textContent =
        "0%";


    statusBox.textContent =
        "TRANSMISSION STOPPED";


    log(
        "Transmission stopped."
    );
}


/*
    ============================================================
    TRANSMIT
    ============================================================
*/

async function transmit() {

    if (isTransmitting) {
        return;
    }


    const text =
        messageInput.value;


    if (!text) {

        statusBox.textContent =
            "ENTER A MESSAGE FIRST";

        return;
    }


    let packet;


    try {

        packet =
            buildPacket(text);

    } catch (error) {

        statusBox.textContent =
            error.message;

        return;
    }


    isTransmitting = true;


    sendButton.disabled = true;

    stopButton.disabled = false;


    try {

        /*
            Use the browser's native audio sample rate.

            We deliberately do NOT force 44100 Hz.
        */

        audioContext =
            new AudioContext();


        await audioContext.resume();


        activeOscillators = [];


        const bits =
            packet.bits;


        const startTime =
            audioContext.currentTime + 0.4;


        const totalDuration =
            bits.length *
            SYMBOL_DURATION;


        statusBox.textContent =
            "TRANSMITTING";


        log(
            "--------------------------------"
        );


        log(
            "Starting transmission."
        );


        log(
            `Message: ${text}`
        );


        log(
            `Bytes: ${packet.bytes.length}`
        );


        log(
            `Bits: ${bits.length}`
        );


        log(
            `Duration: ${totalDuration.toFixed(2)} seconds`
        );


        log(
            `Audio sample rate: ${audioContext.sampleRate} Hz`
        );


        log(
            "Protocol: 2-FSK"
        );


        log(
            "1200 Hz = 0"
        );


        log(
            "2400 Hz = 1"
        );


        /*
            Schedule every symbol.
        */

        for (
            let i = 0;
            i < bits.length;
            i++
        ) {

            const bit =
                bits[i];


            const frequency =
                bit === 0
                    ? ZERO_FREQUENCY
                    : ONE_FREQUENCY;


            const symbolStart =
                startTime +
                i * SYMBOL_DURATION;


            createTone(
                frequency,
                symbolStart,
                SYMBOL_DURATION
            );
        }


        /*
            Progress display.
        */

        const transmissionStart =
            performance.now();


        transmissionTimer =
            setInterval(() => {

                if (!isTransmitting) {
                    return;
                }


                const elapsed =
                    performance.now() -
                    transmissionStart;


                const percent =
                    Math.min(
                        100,
                        (
                            elapsed /
                            (totalDuration * 1000)
                        ) * 100
                    );


                progressBar.style.width =
                    `${percent}%`;


                progressText.textContent =
                    `${Math.floor(percent)}%`;


            }, 50);


        /*
            Finish after all tones have played.
        */

        setTimeout(() => {

            if (!isTransmitting) {
                return;
            }


            if (transmissionTimer) {

                clearInterval(
                    transmissionTimer
                );

                transmissionTimer = null;
            }


            progressBar.style.width =
                "100%";

            progressText.textContent =
                "100%";


            statusBox.textContent =
                "TRANSMISSION COMPLETE";


            log(
                "Transmission complete."
            );


            log(
                "--------------------------------"
            );


            isTransmitting = false;


            sendButton.disabled = false;

            stopButton.disabled = true;


            activeOscillators = [];


            /*
                Keep the AudioContext alive for a
                moment, then close it.
            */

            setTimeout(() => {

                if (audioContext) {

                    audioContext.close();

                    audioContext = null;
                }

            }, 500);


        }, (totalDuration + 0.8) * 1000);


    } catch (error) {

        console.error(error);


        statusBox.textContent =
            "TRANSMISSION ERROR";


        log(
            `ERROR: ${error.message}`
        );


        isTransmitting = false;


        sendButton.disabled = false;

        stopButton.disabled = true;
    }
}


/*
    ============================================================
    BUTTONS
    ============================================================
*/

sendButton.addEventListener(
    "click",
    transmit
);


stopButton.addEventListener(
    "click",
    stopTransmission
);


/*
    Initial log.
*/

log(
    "SONICCRYPT sender initialized."
);

log(
    "2-FSK test protocol ready."
);

log(
    "Waiting for transmission."
);
