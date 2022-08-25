import boards from '../models/boards.js'
import fs from 'fs'

export const createBoard = async (req, res) => {
  try {
    // fs.writeFileSync('tt.json', JSON.stringify(req.updateList))
    if (req.updateList.length > 0) {
      console.log("boards updating");
      const us = Date.now();
      await boards.bulkSave(req.updateList);
      console.log("boards updated" + (Date.now() - us));
    }
    let result
    if (req.newList.length > 0) {
      console.log("boards creating");
      const us = Date.now();
      result = await boards.insertMany(req.newList);
      console.log("boards created" + (Date.now() - us));
    }
    // *******抓之前的filter清單，再把新加入的加進去更新，省效能*****
    const pFilter = req.parent.childBoard.rule.display.filter
    // 只要有post 就補上當次uniqueCol 值
    if (req.updateList.length > 0 || req.newList.length > 0) {
      // 之前有該object且沒重複再加
      if (pFilter.uniqueCol?.c80?.length > 0) {
        if (!pFilter.uniqueCol.c80.includes(req.body.uniqueCol)) {
          pFilter.uniqueCol.c80.push(req.body.uniqueCol)
        }
      } else {
        // 不然直接新增
        pFilter.uniqueCol = { c80: [req.body.uniqueCol] }
      }
      req.parent.markModified('childBoard.rule.display.filter.uniqueCol')
      console.log("uniqueCol updated");
    } else {
      console.log('no changed');
    }

    // dataCol 比較多 要去比對新資料
    if (result) {
      let filterList = new Set(pFilter.dataCol.c0)
      let repeat = new Set()
      result.forEach(board => {
        // 取出所有欄位的資料
        const item = board.colData.c0
        filterList.has(item) ? repeat.add(item) : filterList.add(item);
      })
      // 把取出來不重複清單存回去
      pFilter.dataCol.c0 = [...filterList]
      console.log("filterList builded");
      // 要這樣通知才能更新mixed
      req.parent.markModified('childBoard.rule.display.filter.dataCol')
      await req.parent.save()
      console.log("filter list updated");
    }
    console.log('end---------------------------------');
    res.status(200).send({ success: true, message: '', result })
  } catch (error) {
    console.log(error);
    if (error.name === 'ValidationError') {
      return res.status(400).send({ success: false, message: error.message })
    } else {
      res.status(500).send({ success: false, message: '伺服器錯誤', error })
    }
  } 
}
export const createRoot = async (req, res) => {
  try {
    const result = await boards.create(req.body)
    res.status(200).send({ success: true, message: '', result })
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).send({ success: false, message: error.message })
    } else {
      res.status(500).send({ success: false, message: '伺服器錯誤', error })
    }
  }
}
export const getBoard = async (req, res) => {
  console.log('in controller');
  // console.log(req.board);
  try {

    res.status(200).send({ success: true, message: '', result: req.board })
    console.log("end");
  } catch (error) {
    console.log(error);
    res.status(500).send({ success: false, message: '伺服器錯誤' })
  }
}
export const getBoardTest = async (req, res) => {
  console.log('in controller');
  // console.log(req.board);
  try {
    res.status(200).send({ success: true, message: '', result: req.all })
    console.log("end");
  } catch (error) {
    console.log(error);
    res.status(500).send({ success: false, message: '伺服器錯誤' })
  }
}
export const getChildBoards = async (req, res) => {
  console.log("進Controller");
  try {
    const filter = JSON.parse(decodeURI(req.query.test))
    // 先處理過濾內容
    const condition = { parent: req.params.id }
    // 如果主要filter欄c0沒被宣告過，給預設(下方有宣告就會改false)
    let defaultFilter = true
    // 使用者有輸入內容直接去資料庫查詢即可(打錯就找不到)
    if (filter.filterData.length > 0) {
      filter.filterData.forEach(filter => {
        // 欄位要有字串非空值 + 要有過濾/全部 才算有效
        if (filter.col && typeof filter.col === "string" && (filter.text || filter.all)) {
          // 有宣告過，不用預設值
          if (filter.col === "c0") { defaultFilter = false }
          // 要有過濾 || 全部就不用篩
          if (!filter.all) { condition['colData.' + filter.col] = filter.text }
        }
      })
    }
    // 沒宣告過加上默認過濾
    if (defaultFilter) {
      condition['colData.' + "c0"] = req.board.childBoard.rule.display.filter.dataCol.c0[0]
    }
    // 同 輪到unique的欄位 
    if (filter.filterUnique?.length > 0) {
      filter.filterUnique.forEach(filter => {
        if (filter.col && typeof filter.col === "string" && (filter.text || filter.all)) {
          if (!filter.all) {
            condition['uniqueData.' + filter.col] = filter.text
          }
        }
      })
    }
    // 目前讓前台去比對，先拔除
    // 同 輪到search的欄位(目前只一個，保留彈性用array包)
    // 沒有search.all
    // if (filter.search?.length > 0) {
    //   filter.search.forEach(search => {
    //     if (search.col && typeof search.col === "string" && search.text) {
    //       condition['colData.' + search.col] = RegExp(search.text, "i")
    //     }
    //   })
    // }
    const start1 = Date.now()
    // 只拿會在母版table顯示/用來排序的欄位 就好
    const childBoards = await boards.find(condition, "title beScored colData")
    res.status(200).send({ success: true, message: '', result: childBoards })
    console.log("end");
  } catch (error) {
    console.log(error);
    res.status(500).send({ success: false, message: '伺服器錯誤' })
  }
}