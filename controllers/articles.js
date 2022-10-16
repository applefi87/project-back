import articles from '../models/articles.js'
import boards from '../models/boards.js'
import _ from 'lodash'
import xss from 'xss'
const cleanXSS = (html) => {
  return xss(html)
}
const sanitizeArticle = (req, articleIn) => {
  // 要轉物件才會正常,不然有時delete 等等就是不一樣
  const article = articleIn.toObject()
  // 有留言?---把發文者與留言者要匿名的暱稱+id移除
  if (article.msg1?.amount) {
    const cleanMsg1List = article.msg1.list.map(m => {
      const msg = _.cloneDeep(m)
      // 發文者看自己文章，名稱變成"你"
      // 先存著攻下方辨識就能清空了
      const msgUserId = msg.user._id.toString()
      if (msg.privacy === 0) {
        delete msg.user._id
        msg.user.nickName = null
      }
      if ((msgUserId === article.user._id.toString())) {
        // 避免意外，文章設匿名再刪一次
        if (article.privacy === 0) delete msg.user._id
        // 看發文者在留言區，他的名稱變 "樓主"
        msg.user.nickName = 'originalPoster'
      }
      if (msgUserId === req._id) {
        msg.user.nickName = 'you'
        msg.owner = true
      }
      return msg
    })
    delete article.msg1.list
    article.msg1.list = cleanMsg1List
  }
  // 發文者看自己文章，名稱變成"你"
  if (article.user._id.toString() === req._id) {
    article.user.nickName = 'you'
    article.owner = true
  }
  else if (article.privacy == 0) {
    article.user._id = undefined
    article.user.nickName = null
  }
  return article
}


export const createArticle = async (req, res) => {
  try {
    const result = await articles.create(req.form)
    // 如果是評分版，成功後呼叫板塊更新評分
    if (req.body.category === 1) {
      const board = await boards.findById(req.params.id)
      if (!board) return res.status(403).send({ success: false, message: { title: 'BoardNoFound' } })
      // 之前沒有就產生新beScored物件  不預設放空值是減少資料負擔      
      // board.beScored 因為是mogoose格式,所以沒設也有東西，才用.list去抓
      if (!board.beScored?.list) {
        console.log('create bs');
        board.beScored = { scoreSum: 0, amount: 0, list: [] }
      }
      console.log(board.beScored);
      board.beScored.scoreSum += req.body.score
      board.beScored.amount++
      //對應0分 在陣列[0]+1 就能給chart.js讀取
      // 因應部分板塊用舊規則 有bescore 但沒scoreChart || == []
      if (!(board.beScored.scoreChart?.length === 6)) {
        board.beScored.scoreChart = [0, 0, 0, 0, 0, 0]
      }
      board.beScored.scoreChart[req.body.score]++
      // 
      if (!board.beScored.tags) board.beScored.tags = {}
      for (let i of req.form.tags) {
        if (board.beScored.tags[i] !== undefined) { board.beScored.tags[i]++ }
        else { board.beScored.tags[i] = 1 }
      }
      board.markModified('beScored.tags')
      await board.save()
      // 更新個人評分
      const toBoard = req.user.record.toBoard
      toBoard.list.push({ from: result.id, score: req.body.score })
      toBoard.scoreSum += req.body.score
      toBoard.scoreChart[req.body.score]++
      toBoard.amount++
      await req.user.save()
    }
    res.status(200).send({ success: true, message: { title: 'published' } })
  } catch (error) {
    console.log(error);
    if (error.name === 'ValidationError') {
      return res.status(400).send({ success: false, message: { title: '格式不符', text: error.message } })
    } else {
      res.status(500).send({ success: false, message: { title: error } })
    }
  }
}

export const createMsg = async (req, res) => {
  try {
    const article = await articles.findById(req.params.id)
    if (!article) return res.status(403).send({ success: false, message: '留言異常，查無此評價' })
    // 找到後加留言
    if (!(article.msg1?.amount)) article.msg1 = { amount: 0, nowId: 0, list: [] }
    article.msg1.amount++
    article.msg1.nowId++
    // beScored:  msg2先忽略
    article.msg1.list.push({
      id: article.msg1.nowId, user: req.user._id, privacy: req.body.privacy, lastEditDate: Date.now(), content: req.body.content
    })
    // 偷工 抓資料就加工(預期存=取)
    await article.save()
    const newArticle = await articles.findById(req.params.id).
      populate({
        path: 'msg1.list.user',
        select: 'nickName _id'
      })
    res.status(200).send({ success: true, message: { title: 'published' }, result: sanitizeArticle(req, newArticle) })
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).send({ success: false, message: { title: 'ValidationError', text: error.message } })
    } else {
      res.status(500).send({ success: false, message: { title: error } })
    }
    console.log(error);
  }
}
export const editArticle = async (req, res) => {
  console.log('in controller editArticle');
  try {
    // 有評分，則先驗證評分格式 
    if (req.body.score !== undefined) {
      if (!(Number.isInteger(req.body.score) && req.body.score <= 5 && req.body.score >= 0)) {
        return res.status(401).send({ success: false, message: '評分格式錯誤' })
      }
    }
    // 找該文章
    const article = await articles.findById(req.body._id)
    // (給schema檢查)
    article.privacy = req.body.privacy || 0
    article.title = req.body.title
    article.content = cleanXSS(req.body.content)
    // 是1(評價版)才加評分 (給schema檢查)
    let isScoreChange
    let scoreChange
    if (article.category === 1) {
      isScoreChange = req.body.score !== article.score
      scoreChange = _.cloneDeep([article.score, req.body.score])
      article.score = req.body.score
    }
    //找是否有對應到母版該category的規則
    const category = req.article.category.find((it) => {
      return it.c == req.body.category
    })
    // 處理tag (母板歸有訂才加入) (已經審查完內容)
    // 等等判斷是否更新版資料用
    let isTagsChange
    let tagsChange
    if (category.tagActive) {
      const tags = []
      const tagsObj = category.tagOption
      for (let tag of Object.keys(tagsObj)) {
        // 清單有，但沒被加過(避免重複的tag)才加入
        if (req.body.tags?.includes(tag) && !tags.includes(tag)) tags.push(tag)
      }
      isTagsChange = !_.isEqual(_.sortBy(article.tags), _.sortBy(tags))
      tagsChange = _.cloneDeep([article.tags, tags])
      article.tags = tags
    }
    // 不用mongoose內建，因為我編輯評價分數會被自動更新，但只有發文者改資料才該更新
    article.update_at = Date.now()
    // 先忽略schema 的 cols
    // const columns = []
    // column.
    //   form.columns = 2
    // return res.status(403).send({ success: false, message: '到這完成', result: form })
    await article.save()
    // 更新版評分/tags/使用者評分***(如果有更動的話)
    // 如果是評分版，成功後呼叫板塊更新評分
    if (req.body.category === 1) {
      console.log(scoreChange, tagsChange);
      if (isTagsChange || isScoreChange) {
        const board = await boards.findById(req.body.board)
        if (!board) return res.status(403).send({ success: false, message: { title: 'BoardNoFound' } })
        // 考量只是加陣列不太會出錯，最簡單算法拿之前的算
        if (isScoreChange) {
          board.beScored.scoreSum += scoreChange[1] - scoreChange[0]
          //對應0分 在陣列[0]+1 就能給chart.js讀取
          board.beScored.scoreChart[scoreChange[0]]--
          board.beScored.scoreChart[scoreChange[1]]++
        }
        if (isTagsChange) {
          for (let i of tagsChange[0]) board.beScored.tags[i]--
          for (let i of tagsChange[1]) {
            if (board.beScored.tags[i] !== undefined) { board.beScored.tags[i]++ }
            else { board.beScored.tags[i] = 1 }
          }
          board.markModified('beScored.tags')
        }
        await board.save()
      }
      if (isScoreChange) {
        // 更新個人評分
        const toBoard = req.user.record.toBoard
        toBoard.list[toBoard.list.findIndex(a => a.from.toString() === article._id.toString())].score = scoreChange[1]
        toBoard.scoreSum += scoreChange[1] - scoreChange[0]
        toBoard.scoreChart[scoreChange[0]]--
        toBoard.scoreChart[scoreChange[1]]++
        await req.user.save()
      }
    }


    res.status(200).send({ success: true, message: { title: 'published' } })
  } catch (error) {
    console.log(error);
    res.status(500).send({ success: false, message: '伺服器錯誤' })
  }
}
export const getArticles = async (req, res) => {
  try {
    console.log('in controller');
    const articleList = await articles.find({ board: req.params.id }).
      populate({
        path: 'user',
        select: "nickName score info.gender record.toBoard.score record.toBoard.amount record.toBoard.scoreChart msg1"
      }).
      populate({
        path: 'msg1.list.user',
        select: 'nickName '
      })
    // 有文章?---把發文者與留言者要匿名的暱稱+id移除
    if (articleList.lenth < 1) return res.status(403).send({ success: true, message: '' })
    const out = articleList.map(a => {
      return sanitizeArticle(req, a)
    })
    console.log('end');
    res.status(200).send({ success: true, message: '', result: out })
  } catch (error) {
    console.log(error);
    res.status(500).send({ success: false, message: 'ServerError' })
  }
}



export const banMsg = async (req, res) => {
  console.log('in controller');
  try {
    const article = await articles.findById(req.params.id)
    if (!article) return res.status(403).send({ success: false, message: '查無此評價' })
    article.state = 0
    const result = await article.save()
    // console.log(result);
    res.status(200).send({ success: true, message: '', result })
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).send({ success: false, message: { title: 'ValidationError', text: error.message } })
    } else {
      res.status(500).send({ success: false, message: { title: error } })
    }
    console.log(error);
  }
}

export const getArticle = async (req, res) => {
  console.log('in controller');
  try {
    const article = await articles.findById(req.params.id)
    if (!article) return res.status(403).send({ success: false, message: '查無此評價' })
    res.status(200).send({ success: true, message: '', result: article })
  } catch (error) {
    console.log(error);
    if (error.name === 'ValidationError') {
      return res.status(400).send({ success: false, message: { title: 'ValidationError', text: error.message } })
    } else {
      res.status(500).send({ success: false, message: { title: error } })
    }
  }
}