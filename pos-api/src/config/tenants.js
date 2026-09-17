// Port of config/tenants.php — maps each subdomain to its MySQL database
module.exports = {
  'chaminda-pos.lumac.cc': {
    database: 'chandana_pos',
    username: 'pos_user',
    password: 'Pos@2026Strong',
  },
  'ckd-pos.lumac.cc': {
    database: 'ckd_pos',
    username: 'pos_user',
    password: 'Pos@2026Strong',
  },
  'kahatagasdigiliya-pos.lumac.cc': {
    database: 'kahatagasdigiliya_pos',
    username: 'pos_user',
    password: 'Pos@2026Strong',
  },
  'newanura-pos.lumac.cc': {
    database: 'newAnura_pos',
    username: 'pos_user',
    password: 'Pos@2026Strong',
  },
  // Demo
  'hardware-pos.lumac.cc': {
    database: 'hardware_pos',
    username: 'pos_user',
    password: 'Pos@2026Strong',
  },
  'textile-pos.lumac.cc': {
    database: 'textile_pos',
    username: 'pos_user',
    password: 'Pos@2026Strong',
  },
  'lover-pos.lumac.cc': {
    database: 'lover_pos',
    username: 'pos_user',
    password: 'Pos@2026Strong',
  },
  localhost: {
   database: 'anura_v2',
    username: 'root',
    password: 'root',
    host: '127.0.0.1',
  },
  '127.0.0.1': {
    database: 'anura_v2',
    username: 'root',
    password: 'root',
    host: '127.0.0.1',
  },
};
