const fs = require('fs');
const path = require('path');

const CONTACTS_FILE = path.join(__dirname, 'data', 'contacts.json');
const CONTACTS_EXAMPLE_FILE = path.join(__dirname, 'data', 'contacts.example.json');

class ContactsDirectory {
  constructor() {
    this.contacts = [];
    this.load();
  }

  normalize(phone) {
    if (!phone) return '';
    const digits = String(phone).replace(/\D/g, '');
    // Last 10 digits standard for India
    return digits.length >= 10 ? digits.slice(-10) : digits;
  }

  load() {
    try {
      if (fs.existsSync(CONTACTS_FILE)) {
        const raw = fs.readFileSync(CONTACTS_FILE, 'utf8');
        this.contacts = JSON.parse(raw);
      } else if (fs.existsSync(CONTACTS_EXAMPLE_FILE)) {
        const raw = fs.readFileSync(CONTACTS_EXAMPLE_FILE, 'utf8');
        this.contacts = JSON.parse(raw);
      } else {
        this.contacts = [
          { id: 'demo1', name: 'Demo Contact', phoneNumber: '+15551234567' }
        ];
        this.saveToFile();
      }
    } catch (err) {
      console.error('[Contacts] Error loading contacts:', err);
      this.contacts = [];
    }
  }

  saveToFile() {
    try {
      const dir = path.dirname(CONTACTS_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(CONTACTS_FILE, JSON.stringify(this.contacts, null, 2));
    } catch (err) {
      console.error('[Contacts] Error saving contacts file:', err);
    }
  }

  getAll() {
    return this.contacts;
  }

  resolve(phone) {
    if (!phone) return null;
    const clean = this.normalize(phone);
    if (!clean) return null;
    return this.contacts.find(c => this.normalize(c.phoneNumber) === clean) || null;
  }

  resolveName(phone, fallback = 'WhatsApp Caller') {
    const contact = this.resolve(phone);
    return contact ? contact.name : fallback;
  }

  upsert(contact) {
    if (!contact || !contact.phoneNumber || !contact.name) {
      throw new Error('Name and phone number are required');
    }
    const clean = this.normalize(contact.phoneNumber);
    const existingIndex = this.contacts.findIndex(c => this.normalize(c.phoneNumber) === clean);
    if (existingIndex >= 0) {
      this.contacts[existingIndex] = { ...this.contacts[existingIndex], ...contact };
    } else {
      const id = contact.id || contact.name.toLowerCase().replace(/[^a-z0-9]/g, '') || String(Date.now());
      this.contacts.push({ ...contact, id });
    }
    this.saveToFile();
    return this.contacts;
  }
}

const contactsDirectory = new ContactsDirectory();
module.exports = contactsDirectory;

