
const pageNotFound = async(req,res)=>{
    try{
        res.render('page-err')
    }catch(error){
        res.redirect("/pageNotFound")
    }
}


const loadHomepage = async (req, res) => {
    try {
         return res.render('home')
    } catch (error) {
        console.log("home page not found")
        res.send(500).send('server Error')
    }
} 




module.exports={
    loadHomepage,
    pageNotFound
}

