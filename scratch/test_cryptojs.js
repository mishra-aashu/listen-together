const CryptoJS = require('crypto-js');

const SECRET_KEY = '38346591';
const encryptedUrl = "ID2ieOjCrwfgWvL5sXl4B1ImC5QfbsDyryhkSYK5IH2E7FCO52VR6yhNbcEbes5iCcja4+W8xhE0SwtCJToN4Bw7tS9a8Gtq";

function decrypt(data) {
    try {
        const key = CryptoJS.enc.Utf8.parse(SECRET_KEY);
        const decrypted = CryptoJS.DES.decrypt(
            { ciphertext: CryptoJS.enc.Base64.parse(data) },
            key,
            { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }
        );
        return decrypted.toString(CryptoJS.enc.Utf8);
    } catch (e) {
        console.error('CryptoJS Decryption failed:', e.message);
        return null;
    }
}

console.log('Result:', decrypt(encryptedUrl));
