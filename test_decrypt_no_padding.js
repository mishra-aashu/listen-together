const crypto = require('crypto');

function decode(url) {
    try {
        const key = '38346591';
        const decipher = crypto.createDecipheriv('des-ecb', key, null);
        decipher.setAutoPadding(false);
        let decoded = decipher.update(url, 'base64', 'utf8');
        decoded += decipher.final('utf8');
        return decoded;
    } catch (err) {
        return 'ERROR: ' + err.message;
    }
}

const testUrl = 'ID2ieOjCrwfgWvL5sXl4B1ImC5QfbsDyx6+PYTH0Fzy04C8Ok/hFkL3jJ5qZ0NQHduYa5rQA4uoAZieHc+Q97hw7tS9a8Gtq';
console.log('Result:', decode(testUrl));
