import cn from 'classnames'
import React, { FormEventHandler, KeyboardEventHandler, useEffect, useRef, useState } from 'react'
import { useDispatch } from 'react-redux'
import { actions } from '../redux/actions'
import { Todo as TodoType } from '../types'

export const Todo = ({ id, completed, content }: TodoType) => {
  const dispatch = useDispatch()

  // component state
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState(content)

  // input.current will contain a reference to the editing input
  const input = useRef<HTMLInputElement>() as React.RefObject<HTMLInputElement>

  useEffect(() => {
    // side effect: need to select all content in the input when going into editing mode
    // this will only fire when `editing` changes
    if (editing && input.current) input.current.select()
  }, [editing, input])

  // we save when the user has either tabbed or clicked away, or hit Enter
  const save: FormEventHandler<HTMLInputElement> = (e: React.FormEvent<HTMLInputElement>) => {
    const saveContent = (e.target as HTMLInputElement).value.trim()
    if (saveContent.length > 0) {
      // todo was changed - keep the edited content
      dispatch(actions.editTodo(id, saveContent))
    } else {
      // user has removed all the content of the todo, so delete it
      dispatch(actions.destroyTodo(id))
    }
    leaveEditMode()
  }

  // listen for special keys
  const onKeyDown: KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === 'Escape') {
      restoreContent()
      leaveEditMode()
    } else if (e.key === 'Enter') {
      save(e)
    }
  }

  const enterEditMode = () => setEditing(true)
  const leaveEditMode = () => setEditing(false)

  const updateContent: FormEventHandler<HTMLInputElement> = (e) =>
    setEditContent((e.target as HTMLInputElement).value)
  const restoreContent = () => setEditContent(content)

  return (
    <li className={cn({ completed, editing })}>
      <div className="view">
        <input
          className="toggle"
          type="checkbox"
          checked={completed}
          onChange={() => dispatch(actions.toggleTodo(id))}
        />
        <label onClick={enterEditMode}>{content}</label>
        <button
          className="destroy"
          style={{ cursor: 'pointer' }}
          onClick={() => dispatch(actions.destroyTodo(id))}
        />
      </div>

      <input
        className="edit"
        ref={input}
        value={editContent}
        onBlur={save}
        onChange={updateContent}
        onKeyDown={onKeyDown}
      />
    </li>
  )
}
