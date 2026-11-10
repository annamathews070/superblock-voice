const fs = require('fs');
const path = require('path');

const BUSINESS_FILE = path.join(__dirname, 'businesses.json');
const BUSINESS_EXAMPLE_FILE = path.join(__dirname, 'businesses.example.json');

class BusinessDirectory {
  constructor() {
    this.businesses = [];
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(BUSINESS_FILE)) {
        const raw = fs.readFileSync(BUSINESS_FILE, 'utf8');
        this.businesses = JSON.parse(raw);
      } else if (fs.existsSync(BUSINESS_EXAMPLE_FILE)) {
        const raw = fs.readFileSync(BUSINESS_EXAMPLE_FILE, 'utf8');
        this.businesses = JSON.parse(raw);
      }
    } catch (e) {
      console.error('[BusinessDirectory] Failed to read businesses.json:', e);
      this.businesses = [];
    }
  }

  save() {
    try {
      fs.writeFileSync(BUSINESS_FILE, JSON.stringify(this.businesses, null, 2), 'utf8');
    } catch (e) {
      console.error('[BusinessDirectory] Failed to write businesses.json:', e);
    }
  }

  getAll() {
    return this.businesses;
  }

  updateAll(list) {
    this.businesses = list;
    this.save();
    return this.businesses;
  }

  cleanNumber(num) {
    if (!num) return '';
    const digits = num.replace(/\D/g, '');
    return digits.length > 10 ? digits.slice(-10) : digits;
  }

  resolve(phoneNumber, metaPhoneNumberId = null, metaOwnerBusinessId = null) {
    // 1. Try matching by Meta Phone Number ID (the most accurate unique identifier from Meta)
    if (metaPhoneNumberId) {
      const matchById = this.businesses.find(
        (b) => b.phoneNumberId && String(b.phoneNumberId).trim() === String(metaPhoneNumberId).trim()
      );
      if (matchById) {
        return {
          ...matchById,
          wabaId: matchById.wabaId || metaOwnerBusinessId || 'N/A'
        };
      }
    }

    // 2. Try matching by phone number
    if (phoneNumber) {
      const cleanInput = this.cleanNumber(phoneNumber);
      const matchByPhone = this.businesses.find((b) => {
        const cleanBiz = this.cleanNumber(b.phoneNumber);
        return cleanBiz && cleanBiz === cleanInput;
      });

      if (matchByPhone) {
        return {
          ...matchByPhone,
          phoneNumberId: matchByPhone.phoneNumberId || metaPhoneNumberId || 'N/A',
          wabaId: matchByPhone.wabaId || metaOwnerBusinessId || 'N/A'
        };
      }
    }

    // 3. Fallback: Auto-detected business from live Meta SIP headers
    return {
      id: `auto-${metaPhoneNumberId || Date.now()}`,
      name: metaPhoneNumberId ? `Business (${metaPhoneNumberId})` : 'Superblock Tenant',
      phoneNumber: phoneNumber || 'Unknown',
      phoneNumberId: metaPhoneNumberId || 'Not Assigned',
      wabaId: metaOwnerBusinessId || 'Not Assigned',
      color: 'teal'
    };
  }
}

module.exports = new BusinessDirectory();
