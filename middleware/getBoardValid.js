import file from '../classesOut.js'
import boards from '../models/boards.js'

// 代碼表示: 1單行文字 2多行文字 3數字  5單選 6多選 0Boolean 

export default async (req, res, next) => {
  const board = await boards.findById(req.params.id)
  if (!board) return res.status(403).send({ success: false, message: '找無該版' })
  const childBoards = await boards.find({ _id: req.params.id, })
  if (req.params.search) {

  }

  next()
}

