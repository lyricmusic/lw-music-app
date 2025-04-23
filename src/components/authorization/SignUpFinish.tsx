import { useState } from 'react'

import { Box } from '@mui/material'
import TextField from '@mui/material/TextField'

const style = {
  backgroundColor: '#fff',
  boxShadow: 24,
  left: '50%',
  p: 4,
  position: 'absolute' as 'absolute',
  top: '50%',
  transform: 'translate(-50%, -50%)',
  width: 400,
}

export function SignUpFinish() {
  const [nickName, setNickName] = useState('')

  const handleSelectAvatar = () => {}

  return (
    <Box sx={style}>
      <div className="">
        <h2>Вы зарегистрироованы</h2>
      </div>
      <div className="">
        <span>Придумайте никнейм</span>
        <TextField
          className="w-full"
          onChange={e => setNickName(e.target.value)}
          placeholder="Никнейм"
          value={nickName}
          variant="filled"
        />

        <span>Установите аватар</span>
        <div className="">
          <img alt="Выбранный" src="" />
        </div>
        <div className="">
          <span>Предлагаемые аватары</span>
          <div className="" onClick={handleSelectAvatar}>
            {/*<img alt="1" src={avatar1} />*/}
          </div>
        </div>
      </div>
    </Box>
  )
}
