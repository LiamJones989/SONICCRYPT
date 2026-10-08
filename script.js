/*
    SONICCRYPT
    Acoustic Data Transmission Prototype

    Protocol:

    1. File bytes
    2. Convert each byte to binary
    3. Generate 5 random bits
    4. Add random bits BEFORE the byte
    5. Result = 13-bit block
    6. Convert bits into FSK audio
*/


const fileInput = document.getElementById("fileInput");
const uploadArea = document.getElementById("uploadArea");

const previewContainer =
    document.getElementById("previewContainer");

const imagePreview =
    document.getElementById("imagePreview");

const fileName =
    document.getElementById("fileName");

const fileSize =
    document.getElementById("fileSize");

const removeFile =
    document.getElementById("removeFile");

const generateButton =
    document.getElementById("generateButton");

const playButton =
    document.getElementById("playButton");

const binaryPreview =
    document.getElementById("binaryPreview");

const dataSize =
    document.getElementById("dataSize");

const encodedSize =
    document.getElementById("encodedSize");

const duration =
    document.getElementById("duration");

const progress =
    document.getElementById("progress");

const progressPercent =
    document.getElementById("progressPercent");

const transmissionStatus =
    document.getElementById("transmissionStatus");

const transmitterStatus =
    document.getElementById("transmitterStatus");

const waveformCanvas =
    document.getElementById("waveformCanvas");

const waveformText =
    document.getElementById("waveformText");


let selectedFile = null;

let generatedAudio = null;

let audioContext = null;

let audioBuffer = null;

let audioSource = null;


/*
    AUDIO SETTINGS
*/

const SAMPLE_RATE = 44100;

/*
    Two frequencies represent 0 and 1.

    These are intentionally separated enough
    to make the first prototype easier to decode.
*/

const FREQUENCY_0 = 1200;
const FREQUENCY_1 = 2200;

/*
    Number of audio samples used for each bit.

    Larger values = slower transmission
    but easier decoding.
*/

const BIT_DURATION = 0.025;


/*
    FILE SELECTION
*/

uploadArea.addEventListener(
    "click",
    () => fileInput.click()
);


fileInput.addEventListener(
    "change",
    () => {

        if (!fileInput.files.length) {
            return;
        }

        loadFile(fileInput.files[0]);
    }
);


/*
    DRAG AND DROP
*/

uploadArea.addEventListener(
    "dragover",
    (event) => {

        event.preventDefault();

        uploadArea.classList.add("dragging");
    }
);


uploadArea.addEventListener(
    "dragleave",
    () => {

        uploadArea.classList.remove("dragging");
    }
);


uploadArea.addEventListener(
    "drop",
    (event) => {

        event.preventDefault();

        uploadArea.classList.remove("dragging");

        const file = event.dataTransfer.files[0];

        if (!file) {
            return;
        }

        if (!file.type.startsWith("image/")) {
            alert("Please select an image.");
            return;
        }

        loadFile(file);
    }
);


/*
    LOAD IMAGE
*/

function loadFile(file) {

    selectedFile = file;

    fileName.textContent =
        file.name;

    fileSize.textContent =
        formatBytes(file.size);

    dataSize.textContent =
        formatBytes(file.size);

    const objectURL =
        URL.createObjectURL(file);

    imagePreview.src =
        objectURL;

    uploadArea.hidden = true;

    previewContainer.hidden = false;

    generateButton.disabled = false;

    transmissionStatus.textContent =
        "DATA LOADED";

    transmitterStatus.textContent =
        "READY";

    binaryPreview.textContent =
        "READY TO ENCODE";
}


/*
    REMOVE FILE
*/

removeFile.addEventListener(
    "click",
    () => {

        selectedFile = null;

        fileInput.value = "";

        previewContainer.hidden = true;

        uploadArea.hidden = false;

        generateButton.disabled = true;

        playButton.disabled = true;

        binaryPreview.textContent =
            "WAITING FOR DATA...";

        transmissionStatus.textContent =
            "READY";

        transmitterStatus.textContent =
            "STANDBY";

        dataSize.textContent =
            "0 KB";

        encodedSize.textContent =
            "0 KB";

        duration.textContent =
            "0.0 SEC";

        progress.style.width =
            "0%";

        progressPercent.textContent =
            "0%";

        clearWaveform();
    }
);


/*
    GENERATE AUDIO
*/

generateButton.addEventListener(
    "click",
    async () => {

        if (!selectedFile) {
            return;
        }

        generateButton.disabled = true;

        playButton.disabled = true;

        transmitterStatus.textContent =
            "ENCODING";

        transmissionStatus.textContent =
            "PROCESSING";

        progress.style.width =
            "0%";

        progressPercent.textContent =
            "0%";

        try {

            const bytes =
                new Uint8Array(
                    await selectedFile.arrayBuffer()
                );


            /*
                CREATE CUSTOM 5-BIT PROTOCOL
            */

            const encodedBits =
                createSonicCryptBits(bytes);


            /*
                SHOW A SMALL PREVIEW
            */

            binaryPreview.textContent =
                encodedBits
                    .slice(0, 130)
                    .join("");


            encodedSize.textContent =
                formatBytes(
                    encodedBits.length / 8
                );


            /*
                GENERATE AUDIO
            */

            audioBuffer =
                createAudioBuffer(encodedBits);


            duration.textContent =
                audioBuffer.duration.toFixed(2)
                + " SEC";


            /*
                DRAW VISUAL WAVEFORM
            */

            drawWaveform(audioBuffer);


            transmitterStatus.textContent =
                "READY";

            transmissionStatus.textContent =
                "AUDIO READY";

            progress.style.width =
                "100%";

            progressPercent.textContent =
                "100%";

            playButton.disabled = false;

        }
        catch (error) {

            console.error(error);

            transmitterStatus.textContent =
                "ERROR";

            transmissionStatus.textContent =
                "ENCODING FAILED";

            alert(
                "Could not generate the audio transmission."
            );

        }
        finally {

            generateButton.disabled = false;
        }
    }
);


/*
    CUSTOM SONICCRYPT ENCODING

    Every original byte becomes:

        [5 random bits][8 data bits]

    Example:

        random = 10110
        data   = 01001111

        result =

        10110 01001111

    Total = 13 bits
*/


function createSonicCryptBits(bytes) {

    const bits = [];

    for (const byte of bytes) {

        /*
            Generate five random bits.
        */

        const randomBits =
            new Uint8Array(5);

        crypto.getRandomValues(
            randomBits
        );


        /*
            Add the random five bits.
        */

        for (let i = 0; i < 5; i++) {

            bits.push(
                randomBits[i] & 1
            );
        }


        /*
            Add the original 8 data bits.
        */

        for (let i = 7; i >= 0; i--) {

            bits.push(
                (byte >> i) & 1
            );
        }
    }

    return bits;
}


/*
    CREATE AUDIO BUFFER
*/

function createAudioBuffer(bits) {

    const samplesPerBit =
        Math.floor(
            SAMPLE_RATE * BIT_DURATION
        );

    const totalSamples =
        bits.length * samplesPerBit;


    const buffer =
        new AudioContext({
            sampleRate: SAMPLE_RATE
        }).createBuffer(
            1,
            totalSamples,
            SAMPLE_RATE
        );


    const channel =
        buffer.getChannelData(0);


    let position = 0;


    for (const bit of bits) {

        const frequency =
            bit === 0
                ? FREQUENCY_0
                : FREQUENCY_1;


        for (
            let i = 0;
            i < samplesPerBit;
            i++
        ) {

            /*
                Time inside this bit.
            */

            const time =
                i / SAMPLE_RATE;


            /*
                Generate sine wave.
            */

            let sample =
                Math.sin(
                    2 *
                    Math.PI *
                    frequency *
                    time
                );


            /*
                Fade in/out each bit.

                This reduces clicking between tones.
            */

            const fadeLength =
                Math.min(
                    samplesPerBit * 0.08,
                    100
                );


            if (i < fadeLength) {

                sample *=
                    i / fadeLength;

            }
            else if (
                i >
                samplesPerBit - fadeLength
            ) {

                sample *=
                    (
                        samplesPerBit - i
                    ) / fadeLength;
            }


            channel[position++] =
                sample * 0.35;
        }
    }


    return buffer;
}


/*
    PLAY AUDIO
*/

playButton.addEventListener(
    "click",
    async () => {

        if (!audioBuffer) {
            return;
        }


        if (audioSource) {

            try {
                audioSource.stop();
            }
            catch {}
        }


        if (!audioContext) {

            audioContext =
                new AudioContext();
        }


        /*
            Some browsers require
            AudioContext to be resumed
            after user interaction.
        */

        if (
            audioContext.state ===
            "suspended"
        ) {

            await audioContext.resume();
        }


        audioSource =
            audioContext.createBufferSource();


        audioSource.buffer =
            audioBuffer;


        audioSource.connect(
            audioContext.destination
        );


        audioSource.onended =
            () => {

                transmitterStatus.textContent =
                    "READY";

                transmissionStatus.textContent =
                    "TRANSMISSION COMPLETE";
            };


        transmitterStatus.textContent =
            "TRANSMITTING";

        transmissionStatus.textContent =
            "PLAYING";


        audioSource.start();
    }
);


/*
    FORMAT FILE SIZE
*/

function formatBytes(bytes) {

    if (bytes === 0) {
        return "0 B";
    }

    const units = [
        "B",
        "KB",
        "MB",
        "GB"
    ];

    const index =
        Math.floor(
            Math.log(bytes) /
            Math.log(1024)
        );

    return (
        (bytes /
        Math.pow(1024, index))
            .toFixed(2)
        + " "
        + units[index]
    );
}


/*
    DRAW WAVEFORM
*/

function drawWaveform(buffer) {

    const canvas =
        waveformCanvas;

    const ctx =
        canvas.getContext("2d");

    const rect =
        canvas.getBoundingClientRect();

    canvas.width =
        rect.width * devicePixelRatio;

    canvas.height =
        rect.height * devicePixelRatio;

    ctx.scale(
        devicePixelRatio,
        devicePixelRatio
    );


    const width =
        rect.width;

    const height =
        rect.height;

    ctx.clearRect(
        0,
        0,
        width,
        height
    );


    const data =
        buffer.getChannelData(0);


    const step =
        Math.max(
            1,
            Math.floor(
                data.length / width
            )
        );


    ctx.beginPath();


    for (
        let x = 0;
        x < width;
        x++
    ) {

        const index =
            x * step;

        const value =
            data[index] || 0;


        const y =
            height / 2 +
            value * height * 0.8;


        if (x === 0) {
            ctx.moveTo(x, y);
        }
        else {
            ctx.lineTo(x, y);
        }
    }


    ctx.strokeStyle =
        "#42e8a4";

    ctx.lineWidth =
        1;

    ctx.stroke();


    waveformText.style.display =
        "none";
}


/*
    CLEAR WAVEFORM
*/

function clearWaveform() {

    const ctx =
        waveformCanvas
            .getContext("2d");

    ctx.clearRect(
        0,
        0,
        waveformCanvas.width,
        waveformCanvas.height
    );

    waveformText.style.display =
        "flex";
}
