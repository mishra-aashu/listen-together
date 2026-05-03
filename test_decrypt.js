const crypto = require('crypto');

function decode(url) {
    try {
        const key = '38346b38';
        const decipher = crypto.createDecipheriv('des-ecb', key, null);
        let decoded = decipher.update(url, 'base64', 'utf8');
        decoded += decipher.final('utf8');
        return decoded;
    } catch (err) {
        return 'ERROR: ' + err.message;
    }
}

const testUrl = 'ID2ieOjCrwfgWvL5sXl4B1ImC5QfbsDyryhkSYK5IH2E7FCO52VR6yhNbcEbes5iCcja4+W8xhE0SwtCJToN4Bw7tS9a8Gtq';
console.log('Result:', decode(testUrl));
