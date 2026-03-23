const express = require('express');
const { getAllTags } = require('../services/tagService');
const router = express.Router();

router.get('/', async (req, res) => { res.json(await getAllTags()); });

module.exports = router;
