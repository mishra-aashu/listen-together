const crypto = require('crypto');

const encryptedUrl = "ID2ieOjCrwfgWvL5sXl4B1ImC5QfbsDyryhkSYK5IH2E7FCO52VR6yhNbcEbes5iCcja4+W8xhE0SwtCJToN4Bw7tS9a8Gtq";

const keys = ['38346591'];

keys.forEach(key => {
    try {
        const decipher = crypto.createDecipheriv('des-ecb', key, '');
        let decrypted = decipher.update(encryptedUrl, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        console.log(`Key ${key}: "${decrypted.trim()}"`);
    } catch (e) {
        console.error(`Key ${key} failed:`, e.message);
    }
});
