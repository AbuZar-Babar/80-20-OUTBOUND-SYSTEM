const { WhatsAppTemplateStore } = require('../config/store');

const MERGE_FIELD_REGEX = /\{\{(\w+)\}\}/g;

function applyMergeFields(template, lead) {
  return template.replace(MERGE_FIELD_REGEX, (match, field) => {
    const key = field.toLowerCase();
    if (key === 'name' || key === 'contact_name') return lead.contact?.name || '';
    if (key === 'first_name') return (lead.contact?.name || '').split(' ')[0];
    if (key === 'phone') return lead.contact?.phone || '';
    if (key === 'email') return lead.contact?.email || '';
    if (key === 'position' || key === 'title') return lead.contact?.position || '';
    if (key === 'company' || key === 'company_name') return lead.company?.name || '';
    if (key === 'website' || key === 'company_website') return lead.company?.website || '';
    if (key === 'niche' || key === 'industry') return lead.company?.niche || '';
    if (key === 'city') return lead.geography?.city || '';
    if (key === 'country') return lead.geography?.country || '';
    return '';
  });
}

const getTemplates = async (req, res, next) => {
  try {
    const templates = await WhatsAppTemplateStore.findAll();
    res.status(200).json({ success: true, data: templates });
  } catch (err) { next(err); }
};

const createTemplate = async (req, res, next) => {
  try {
    const { name, body, category } = req.body;
    if (!name || !body) {
      return res.status(400).json({ success: false, message: 'name and body are required.' });
    }
    const mergeFields = [];
    let match;
    const regex = /\{\{(\w+)\}\}/g;
    while ((match = regex.exec(body)) !== null) {
      if (!mergeFields.includes(match[1])) mergeFields.push(match[1]);
    }

    const template = await WhatsAppTemplateStore.create({
      name, body, category: category || 'general', mergeFields, createdBy: req.user._id
    });
    res.status(201).json({ success: true, data: template });
  } catch (err) { next(err); }
};

const updateTemplate = async (req, res, next) => {
  try {
    const template = await WhatsAppTemplateStore.update(req.params.id, req.body);
    if (!template) return res.status(404).json({ success: false, message: 'Template not found.' });
    res.status(200).json({ success: true, data: template });
  } catch (err) { next(err); }
};

const deleteTemplate = async (req, res, next) => {
  try {
    const deleted = await WhatsAppTemplateStore.delete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: 'Template not found.' });
    res.status(200).json({ success: true, message: 'Template deleted.' });
  } catch (err) { next(err); }
};

module.exports = { getTemplates, createTemplate, updateTemplate, deleteTemplate, applyMergeFields };
