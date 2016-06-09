import React, {Component, PropTypes} from 'react'

import {DragDropContext} from 'react-dnd'
import HTML5Backend from 'react-dnd-html5-backend'

import Cell from './cell'
import {BackgroundContainer} from './background-container'

import {keycodeToDirection, DirectionToLocation} from './utils'
import {isLocation, isWithinRegion, isAtLocation, PTRegion, PTLocation} from 'lib/locationUtils'

import './FlowGrid.css'

let upto = (n) => Array.apply(null, {length: n}).map(Number.call, Number)

//It would be better to have this as state, but we don't want this to cause renders.
let lastMousePosition = [0, 0]

@DragDropContext(HTML5Backend)
export default class FlowGrid extends Component{
  displayName: 'FlowGrid'

  static propTypes = {
    items: PropTypes.arrayOf(PropTypes.shape({
      location: PTLocation.isRequired,
      component: PropTypes.object.isRequired
    })),
    edges: PropTypes.arrayOf(PropTypes.shape({
      input: PTLocation.isRequired,
      output: PTLocation.isRequired
    })),
    selectedCell: PTLocation,
    selectedRegion: PTRegion,
    onUndo: PropTypes.func.isRequired,
    onRedo: PropTypes.func.isRequired,
    onSelectItem: PropTypes.func.isRequired,
    onMultipleSelect: PropTypes.func.isRequired,
    onDeSelectAll: PropTypes.func.isRequired,
    onAddItem: PropTypes.func.isRequired,
    onMoveItem: PropTypes.func.isRequired,
    onRemoveItems: PropTypes.func.isRequired,
    onCopy: PropTypes.func.isRequired,
    onPaste: PropTypes.func.isRequired,

    showGridLines: PropTypes.bool,

    overflow: PropTypes.string,
  }

  static defaultProps = {
    showGridLines: true,
  }

  state = {
    hover: {row: -1, column: -1} // An impossible location means nothing hovered.
  }

  _handleMouseLeave(e) {
    window.recorder.recordNamedEvent("FlowGrid set hover state")
    this.setState({
      hover: {row: -1, column: -1},
      leftDown: false,
    })
  }

  _handleMouseUp(e) {
    if (e.button === 0) {
      window.recorder.recordNamedEvent("FlowGrid set left down state")
      this.setState({leftDown: false})
    }
  }

  _handleEmptyCellMouseDown(e, location) {
    if (e.button === 0 && !(e.target && e.target.type === 'textarea')) {
      window.recorder.recordNamedEvent("FlowGrid set left down state")
      this.setState({leftDown: true})
      lastMousePosition = _.pick(e, 'pageX', 'pageY')
      e.preventDefault()
    }
  }

  _mouseMoved(e){
    const sameLocation = (e.pageX === lastMousePosition.pageX) && (e.pageY === lastMousePosition.pageY)
    return !sameLocation
  }

  _handleCellMouseEnter(location, e) {
    window.recorder.recordNamedEvent("FlowGrid set hover state")
    if (this.state.leftDown && this._mouseMoved(e)) {
      this.setState({hover: {row: -1, column: -1}})
      this._handleEndRangeSelect(location)
    } else {
      this.setState({hover: location})
    }
  }

  _handleEndDragCell(location) {
    this.props.onSelectItem(location)
  }

  _handleKeyUp(e){
    if (e.keyCode == '17' || e.keyCode == '224' || e.keyCode == '91') {
      window.recorder.recordNamedEvent("FlowGrid set ctrl pressed state")
      this.setState({ctrlPressed: false})
    }
  }

  _selectedItems() {
   return this.props.items.filter(i => isWithinRegion(i.location, this.props.selectedRegion))
  }

  _handleRemoveSelectedItems() {
    this.props.onRemoveItems(this._selectedItems().map(i => i.key))
  }

  _handleKeyDown(e){
    if (e.target && e.target.type === 'textarea') { return }
    if (e.keyCode === 8 || e.keyCode === 46) {
      this._handleRemoveSelectedItems()
      e.preventDefault()
    }

    let direction = keycodeToDirection(e.keyCode)
    if (direction) {
      e.preventDefault()
      const size = ({columns: this._columnCount(), rows: this._rowCount()})
      let newLocation = new DirectionToLocation(size, this.props.selectedCell)[direction]()
      this.props.onSelectItem(newLocation)
    } else if (!e.shiftKey && (e.keyCode == '17' || e.keyCode == '224' || e.keyCode == '91' || e.keyCode == '93')) {
      e.preventDefault()
      window.recorder.recordNamedEvent("FlowGrid set ctrl pressed state")
      this.setState({ctrlPressed: true})
    } else if (this.state.ctrlPressed) {
      if (e.keyCode == '86') {
        this.props.onPaste()
      } else if (e.keyCode == '67') {
        this.props.onCopy()
      } else if (e.keyCode == '88') {
        this.props.onCut()
      } else if (e.keyCode == '90' && !e.shiftKey) {
        this.props.onUndo()
        e.preventDefault()
      } else if (e.keyCode == '89' || (e.keyCode == '90' && e.shiftKey)) {
        this.props.onRedo()
        e.preventDefault()
      }
    }
  }

  _handleEndRangeSelect(corner1) {
    const corner2 = this.props.selectedCell

    if (!isLocation(corner2)) {
      this.props.onSelectItem(corner1)
      return
    }

    this.props.onMultipleSelect(corner1, corner2)
  }

  size() {
    const lowestItem = !this.props.items.length ? 2 : Math.max(...this.props.items.map(g => parseInt(g.location.row))) + 2
    const selected = parseInt(this.props.selectedCell.row) + 2
    const height = Math.max(3, lowestItem, selected) || 3;
    return {columns: this._columnCount(), rows: height}
  }

  _rowCount() {
    const lowestItem = Math.max(...this.props.items.map(e => parseInt(e.location.row))) + 4
    let selectedRow = this.props.selectedCell.row || 0
    const selected = parseInt(selectedRow) + 3
    return Math.max(10, lowestItem, selected) || 6;
  }

  _columnCount() {
    const lowestItem = Math.max(...this.props.items.map(e => parseInt(e.location.column))) + 4
    let selectedColumn = this.props.selectedCell.column || 0
    const selected = parseInt(selectedColumn) + 4
    return Math.max(6, lowestItem, selected) || 6;
  }

  _addIfNeededAndSelect(location, direction) {
    if (!this.props.items.find(i => isAtLocation(i.location, location))) {
      this.props.onAddItem(location)
    }
    this.props.onSelectItem(location, direction)
  }

  _onReturn(location, isDown){
    const {row, column} = location
    const newRow = isDown ? row + 1 : (row || 1) -1
    const newLocation = {row: newRow, column}
    this._addIfNeededAndSelect(newLocation, isDown ? 'UP' : 'DOWN')
  }

  _onTab(location, isRight){
    const {row, column} = location
    const newCol = isRight ? column + 1 : (column || 1) -1
    const newLocation = {row, column: newCol}
    this._addIfNeededAndSelect(newLocation, isRight ? 'LEFT' : 'RIGHT')
  }

  _cell(location) {
    const item = this.props.items.find(i => isAtLocation(i.location, location));
    return (
      <Cell
        canvasState={this.props.canvasState}
        forceFlowGridUpdate={() => this.forceUpdate()}
        gridKeyPress={this._handleKeyDown.bind(this)}
        hasItemUpdated={this.props.hasItemUpdated}
        handleSelect={this.props.onSelectItem}
        handleEndRangeSelect={this._handleEndRangeSelect.bind(this)}
        inSelectedRegion={isWithinRegion(location, this.props.selectedRegion)}
        inSelectedCell={isAtLocation(this.props.selectedCell, location)}
        selectedFrom={this.props.selectedCell.selectedFrom}
        isHovered={isAtLocation(this.state.hover, location)}
        item={item && item.component}
        key={'grid-item', location.row, location.column}
        location={location}
        onAddItem={this.props.onAddItem}
        onMoveItem={this.props.onMoveItem}
        onMouseEnter={(e) => {this._handleCellMouseEnter(location, e)}}
        onEndDragCell={newLocation => {this._handleEndDragCell(newLocation)}}
        onEmptyCellMouseDown={(e) => {this._handleEmptyCellMouseDown(e, location)}}
        onReturn={(down=true) => {this._onReturn(location, down)}}
        onTab={(right=true) => {this._onTab(location, right)}}
        ref={`cell-${location.row}-${location.column}`}
        getRowHeight={() => {this._getRowHeight(location.row)}}
      />
    )
  }

  _row(row, columnCount) {
    return (
      upto(columnCount).map((column) => {
        return(this._cell({row: row, column: column}))
      })
    )
  }

  _getRowHeight(rowI) {
    return _.get(this.refs[`row-${rowI}`], 'offsetHeight')
  }

  componentDidMount() { window.recorder.recordMountEvent(this) }
  componentWillUpdate() { window.recorder.recordRenderStartEvent(this) }

  componentDidUpdate() {
    window.recorder.recordRenderStopEvent(this)

    const newHeights = upto(this._rowCount()).map(rowI => _.get(this.refs[`row-${rowI}`], 'offsetHeight'))
    if (!_.isEqual(newHeights, this.state.rowHeights)){
      window.recorder.recordNamedEvent("FlowGrid set row heights state")
      this.setState({rowHeights: newHeights})
    }
  }

  componentWillUnmount() {
    window.recorder.recordUnmountEvent(this)
    this.props.onDeSelectAll()
  }

  render() {
    const rowCount = this._rowCount()
    const columnCount = this._columnCount()
    const {edges} = this.props
    let className = 'FlowGrid'
    className += this.props.showGridLines ? ' withLines' : ''

    return (
      <div
        className='FlowGrid-Container'
        style={{overflow: this.props.overflow }}
        onMouseLeave={this._handleMouseLeave.bind(this)}
        onMouseUp={this._handleMouseUp.bind(this)}
        onKeyDown={this._handleKeyDown.bind(this)}
        onKeyUp={this._handleKeyUp.bind(this)}
      >
        <div className='FlowGrid-Horizontal-Motion'>
          <div className={className}>
            {
              upto(rowCount).map((row) => {
                return (
                  <div
                      className='FlowGridRow'
                      key={row}
                      ref={`row-${row}`}
                  >
                  {this._row(row, columnCount)}
                  </div>
                )
              })
            }
              <BackgroundContainer
                edges={edges}
                rowHeights={_.map(upto(rowCount), (_r, i) => this.getRowHeight(i))}
                selectedRegion={this.props.selectedRegion}
                copiedRegion={this.props.copiedRegion}
              />
          </div>
        </div>
      </div>
    )
  }
}
